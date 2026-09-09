import { jwtVerify } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const obterConexao = vi.fn();

vi.mock("../src/infra/db.js", () => ({
  obterConexao,
  encerrarConexao: vi.fn(),
}));

const { handler } = await import("../src/handlers/token.js");

const SEGREDO = "jwt-local-secret-123456789012345678901234567890";

const CPF_VALIDO = "529.982.247-25";
const CPF_NORMALIZADO = "52998224725";

/** Fake do `pg.Client`: devolve as linhas combinadas no teste, sem tocar em banco. */
function conexaoQueDevolve(linhas: unknown[]) {
  return { query: vi.fn().mockResolvedValue({ rows: linhas }) };
}

function evento(corpo: unknown, cabecalhos: Record<string, string> = {}) {
  return {
    body: typeof corpo === "string" ? corpo : JSON.stringify(corpo),
    isBase64Encoded: false,
    headers: cabecalhos,
    requestContext: { requestId: "req-123" },
  } as never;
}

function corpoDa(resposta: { body?: string }) {
  return JSON.parse(resposta.body ?? "{}");
}

beforeEach(() => {
  vi.stubEnv("DB_HOST", "localhost");
  vi.stubEnv("DB_PORT", "5432");
  vi.stubEnv("DB_NAME", "oficina");
  vi.stubEnv("DB_USER", "postgres");
  vi.stubEnv("DB_PASSWORD", "postgres");
  vi.stubEnv("SECURITY_JWT_SECRET", SEGREDO);
  vi.stubEnv("SECURITY_JWT_EXPIRATION", "7200000");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("cliente valido e ativo", () => {
  beforeEach(() => {
    obterConexao.mockResolvedValue(
      conexaoQueDevolve([{ id: 7, nome: "Mariana Oliveira Silva", ativo: true }]),
    );
  });

  it("responde 200 com o token e os dados do cliente", async () => {
    const resposta = await handler(evento({ cpf: CPF_VALIDO }));

    expect(resposta.statusCode).toBe(200);

    const corpo = corpoDa(resposta);

    expect(corpo.tipo).toBe("Bearer");
    expect(corpo.cliente).toEqual({ id: 7, nome: "Mariana Oliveira Silva" });
    expect(typeof corpo.token).toBe("string");
  });

  it("assina o token com as claims que o filtro do Spring espera", async () => {
    const resposta = await handler(evento({ cpf: CPF_VALIDO }));

    const { payload, protectedHeader } = await jwtVerify(
      corpoDa(resposta).token,
      new TextEncoder().encode(SEGREDO),
    );

    expect(protectedHeader.alg).toBe("HS256");
    expect(payload.sub).toBe(CPF_NORMALIZADO);
    expect(payload.tipo).toBe("CLIENTE");
    expect(payload.clienteId).toBe(7);
    expect(payload.nome).toBe("Mariana Oliveira Silva");
    expect(payload.role).toBe("CLIENTE");
    expect(payload.exp).toBe((payload.iat as number) + 7200);
  });

  it("consulta o banco com o CPF ja normalizado", async () => {
    const conexao = conexaoQueDevolve([{ id: 7, nome: "Mariana", ativo: true }]);
    obterConexao.mockResolvedValue(conexao);

    await handler(evento({ cpf: CPF_VALIDO }));

    expect(conexao.query).toHaveBeenCalledWith(expect.any(String), [
      CPF_NORMALIZADO,
    ]);
  });

  it("converte o id em numero, mesmo quando o driver entrega texto", async () => {
    // `id` e BIGSERIAL: o driver do PostgreSQL devolve `int8` como string. Se a claim `clienteId`
    // sair como texto, o filtro do Spring recusa o token.
    obterConexao.mockResolvedValue(
      conexaoQueDevolve([{ id: "2", nome: "Carlos Eduardo Pontes", ativo: true }]),
    );

    const resposta = await handler(evento({ cpf: CPF_VALIDO }));

    const { payload } = await jwtVerify(
      corpoDa(resposta).token,
      new TextEncoder().encode(SEGREDO),
    );

    expect(payload.clienteId).toBe(2);
    expect(corpoDa(resposta).cliente.id).toBe(2);
  });

  it("aceita corpo codificado em base64, como o Gateway pode entregar", async () => {
    const codificado = {
      body: Buffer.from(JSON.stringify({ cpf: CPF_VALIDO })).toString("base64"),
      isBase64Encoded: true,
      headers: {},
      requestContext: { requestId: "req-123" },
    } as never;

    expect((await handler(codificado)).statusCode).toBe(200);
  });
});

describe("CPF recusado", () => {
  const casos: Array<[string, unknown]> = [
    ["digito verificador errado", { cpf: "529.982.247-24" }],
    ["sequencia repetida", { cpf: "111.111.111-11" }],
    ["cpf vazio", { cpf: "" }],
    ["cpf ausente", {}],
    ["cpf que nao e texto", { cpf: 52998224725 }],
    ["corpo que nao e JSON", "isto nao e json"],
  ];

  it.each(casos)("responde 400 para %s", async (_nome, corpo) => {
    const resposta = await handler(evento(corpo));

    expect(resposta.statusCode).toBe(400);
    expect(corpoDa(resposta).erro).toBe("CPF_INVALIDO");
    expect(obterConexao).not.toHaveBeenCalled();
  });
});

describe("cliente ausente ou inativo", () => {
  it("responde 404 quando nenhum cliente tem o CPF", async () => {
    obterConexao.mockResolvedValue(conexaoQueDevolve([]));

    const resposta = await handler(evento({ cpf: CPF_VALIDO }));

    expect(resposta.statusCode).toBe(404);
    expect(corpoDa(resposta).erro).toBe("CLIENTE_NAO_ENCONTRADO");
  });

  it("responde 403 quando o cliente esta inativo", async () => {
    obterConexao.mockResolvedValue(
      conexaoQueDevolve([{ id: 7, nome: "Mariana", ativo: false }]),
    );

    const resposta = await handler(evento({ cpf: CPF_VALIDO }));

    expect(resposta.statusCode).toBe(403);
    expect(corpoDa(resposta).erro).toBe("CLIENTE_INATIVO");
  });
});

describe("banco indisponivel", () => {
  it("responde 503 quando a conexao falha", async () => {
    obterConexao.mockRejectedValue(new Error("connection timeout"));

    const resposta = await handler(evento({ cpf: CPF_VALIDO }));

    expect(resposta.statusCode).toBe(503);
    expect(corpoDa(resposta).erro).toBe("BASE_INDISPONIVEL");
  });

  it("responde 503 quando a consulta falha depois de conectar", async () => {
    obterConexao.mockResolvedValue({
      query: vi.fn().mockRejectedValue(new Error("terminating connection")),
    });

    const resposta = await handler(evento({ cpf: CPF_VALIDO }));

    expect(resposta.statusCode).toBe(503);
  });

  it("responde 503 quando falta variavel de ambiente", async () => {
    vi.stubEnv("SECURITY_JWT_SECRET", "");

    const resposta = await handler(evento({ cpf: CPF_VALIDO }));

    expect(resposta.statusCode).toBe(503);
  });
});

describe("correlacao", () => {
  it("herda o correlationId do cabecalho", async () => {
    obterConexao.mockResolvedValue(
      conexaoQueDevolve([{ id: 7, nome: "Mariana", ativo: true }]),
    );

    const resposta = await handler(
      evento({ cpf: CPF_VALIDO }, { "x-correlation-id": "abc-123" }),
    );

    expect(resposta.headers?.["x-correlation-id"]).toBe("abc-123");
  });

  it("usa o requestId do Gateway quando o cabecalho nao vem", async () => {
    obterConexao.mockResolvedValue(conexaoQueDevolve([]));

    const resposta = await handler(evento({ cpf: CPF_VALIDO }));

    expect(corpoDa(resposta).correlationId).toBe("req-123");
  });
});
