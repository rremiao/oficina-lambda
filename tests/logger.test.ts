import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const obterConexao = vi.fn();

vi.mock("../src/infra/db.js", () => ({
  obterConexao,
  encerrarConexao: vi.fn(),
}));

const { handler } = await import("../src/handlers/token.js");

const CPF = "529.982.247-25";
const CPF_NORMALIZADO = "52998224725";

let linhas: string[] = [];

function evento(corpo: unknown, cabecalhos: Record<string, string> = {}) {
  return {
    body: JSON.stringify(corpo),
    isBase64Encoded: false,
    headers: cabecalhos,
    requestContext: { requestId: "req-777" },
  } as never;
}

beforeEach(() => {
  linhas = [];

  vi.spyOn(console, "log").mockImplementation((linha: string) => {
    linhas.push(linha);
  });
  vi.spyOn(console, "error").mockImplementation((linha: string) => {
    linhas.push(linha);
  });

  vi.stubEnv("DB_HOST", "localhost");
  vi.stubEnv("DB_NAME", "oficina");
  vi.stubEnv("DB_USER", "postgres");
  vi.stubEnv("DB_PASSWORD", "postgres");
  vi.stubEnv("SECURITY_JWT_SECRET", "jwt-local-secret-123456789012345678901234567890");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("log estruturado", () => {
  beforeEach(() => {
    obterConexao.mockResolvedValue({
      query: vi.fn().mockResolvedValue({
        rows: [{ id: 2, nome: "Carlos Eduardo Pontes", ativo: true }],
      }),
    });
  });

  it("cada linha e um JSON com os campos do contrato", async () => {
    await handler(evento({ cpf: CPF }));

    expect(linhas).toHaveLength(1);

    const linha = JSON.parse(linhas[0] as string);

    expect(linha).toMatchObject({
      level: "info",
      service: "oficina-auth-token",
      evento: "token_emitido",
      resultado: "sucesso",
      correlationId: "req-777",
    });
    expect(typeof linha.timestamp).toBe("string");
    expect(typeof linha.duracaoMs).toBe("number");
  });

  it("nunca registra o CPF em claro", async () => {
    await handler(evento({ cpf: CPF }));

    const tudo = linhas.join("\n");

    expect(tudo).not.toContain(CPF);
    expect(tudo).not.toContain(CPF_NORMALIZADO);
    expect(JSON.parse(linhas[0] as string).cpf).toMatch(/^[0-9a-f]{12}$/);
  });

  it("nunca registra o token emitido", async () => {
    const resposta = await handler(evento({ cpf: CPF }));

    const token = JSON.parse(resposta.body ?? "{}").token as string;

    expect(linhas.join("\n")).not.toContain(token);
  });

  it("carrega o correlationId recebido em todas as linhas", async () => {
    obterConexao.mockRejectedValue(new Error("connection timeout"));

    await handler(evento({ cpf: CPF }, { "x-correlation-id": "trace-abc" }));

    expect(linhas.length).toBeGreaterThan(1);

    for (const linha of linhas) {
      expect(JSON.parse(linha).correlationId).toBe("trace-abc");
    }
  });
});
