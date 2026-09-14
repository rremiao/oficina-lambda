/**
 * Teste de integração da função `auth-token` contra um PostgreSQL real.
 *
 * Diferente de tests/token.test.ts (que mocka o banco), aqui o handler abre uma conexão de verdade
 * com o Postgres subido por docker-compose.integration.yml e consulta a tabela `cliente`
 * carregada por tests/integration/schema.sql.
 *
 * Não roda no `npm test` — o nome não casa com o glob padrão do Vitest. Use `npm run test:integration`.
 */

import { jwtVerify } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { handler } from "../../src/handlers/token.js";
import { encerrarConexao } from "../../src/infra/db.js";

const SEGREDO = "segredo-de-integracao-com-mais-de-32-caracteres";

beforeAll(() => {
  process.env.DB_HOST = process.env.DB_HOST ?? "localhost";
  process.env.DB_PORT = process.env.DB_PORT ?? "5432";
  process.env.DB_NAME = process.env.DB_NAME ?? "oficina";
  process.env.DB_USER = process.env.DB_USER ?? "postgres";
  process.env.DB_PASSWORD = process.env.DB_PASSWORD ?? "postgres";
  process.env.DB_SSL = "false";
  process.env.SECURITY_JWT_SECRET = SEGREDO;
});

afterAll(async () => {
  await encerrarConexao();
});

function evento(cpf: unknown) {
  return {
    version: "2.0",
    routeKey: "POST /auth/token",
    rawPath: "/auth/token",
    headers: { "content-type": "application/json", "x-correlation-id": "it-001" },
    requestContext: { requestId: "req-it" },
    body: JSON.stringify({ cpf }),
    isBase64Encoded: false,
  } as never;
}

function corpoDa(resposta: { body?: string }) {
  return JSON.parse(resposta.body ?? "{}");
}

describe("integração: POST /auth/token contra Postgres real", () => {
  it("200 e JWT válido para cliente ativo cadastrado com máscara", async () => {
    const resposta = await handler(evento("529.982.247-25"));

    expect(resposta.statusCode).toBe(200);
    expect(resposta.headers?.["x-correlation-id"]).toBe("it-001");

    const corpo = corpoDa(resposta);
    expect(corpo.tipo).toBe("Bearer");
    expect(corpo.cliente.id).toBeGreaterThan(0);
    expect(corpo.cliente.nome).toContain("Ativo");
    expect(typeof corpo.expiraEm).toBe("string");

    const { payload } = await jwtVerify(
      corpo.token,
      new TextEncoder().encode(SEGREDO),
      { algorithms: ["HS256"] },
    );

    expect(payload.sub).toBe("52998224725");
    expect(payload.tipo).toBe("CLIENTE");
    expect(payload.role).toBe("CLIENTE");
    expect(payload.clienteId).toBe(corpo.cliente.id);
    expect(payload.nome).toContain("Ativo");
  });

  it("404 para CPF válido sem cliente correspondente", async () => {
    const resposta = await handler(evento("390.533.447-05"));

    expect(resposta.statusCode).toBe(404);
    expect(corpoDa(resposta).erro).toBe("CLIENTE_NAO_ENCONTRADO");
  });

  it("403 para cliente existente porém inativo", async () => {
    const resposta = await handler(evento("111.444.777-35"));

    expect(resposta.statusCode).toBe(403);
    expect(corpoDa(resposta).erro).toBe("CLIENTE_INATIVO");
  });

  it("400 para CPF com dígito verificador inválido", async () => {
    const resposta = await handler(evento("111.111.111-11"));

    expect(resposta.statusCode).toBe(400);
    expect(corpoDa(resposta).erro).toBe("CPF_INVALIDO");
  });
});
