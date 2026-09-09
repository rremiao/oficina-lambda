import { SignJWT } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { handler } from "../src/handlers/authorizer.js";

const SEGREDO = "jwt-local-secret-123456789012345678901234567890";
const OUTRO_SEGREDO = "outro-segredo-123456789012345678901234567890";

const CPF = "52998224725";

interface OpcoesDoToken {
  segredo?: string;
  expiraEm?: string | number;
  tipo?: string | null;
  clienteId?: number;
}

async function tokenDeCliente({
  segredo = SEGREDO,
  expiraEm = "2h",
  tipo = "CLIENTE",
  clienteId = 2,
}: OpcoesDoToken = {}) {
  const claims: Record<string, unknown> = { clienteId, nome: "Carlos", role: "CLIENTE" };

  if (tipo !== null) {
    claims.tipo = tipo;
  }

  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(CPF)
    .setIssuedAt()
    .setExpirationTime(expiraEm)
    .sign(new TextEncoder().encode(segredo));
}

function evento(cabecalhos: Record<string, string>) {
  return {
    headers: cabecalhos,
    identitySource: [],
    requestContext: { requestId: "req-999" },
  } as never;
}

beforeEach(() => {
  vi.stubEnv("SECURITY_JWT_SECRET", SEGREDO);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("autoriza", () => {
  it("token de cliente valido", async () => {
    const resposta = await handler(
      evento({ authorization: `Bearer ${await tokenDeCliente()}` }),
    );

    expect(resposta.isAuthorized).toBe(true);
    expect(resposta.context.tipo).toBe("CLIENTE");
    expect(resposta.context.clienteId).toBe("2");
  });

  it("token de operador valido, para que a API continue utilizavel pelo Gateway", async () => {
    const token = await tokenDeCliente({ tipo: "OPERADOR" });

    const resposta = await handler(evento({ authorization: `Bearer ${token}` }));

    expect(resposta.isAuthorized).toBe(true);
    expect(resposta.context.tipo).toBe("OPERADOR");
  });

  it("token sem a claim tipo, lido como operador igual a API faz", async () => {
    const token = await tokenDeCliente({ tipo: null });

    const resposta = await handler(evento({ authorization: `Bearer ${token}` }));

    expect(resposta.isAuthorized).toBe(true);
    expect(resposta.context.tipo).toBe("OPERADOR");
  });

  it("cabecalho com caixa diferente", async () => {
    const resposta = await handler(
      evento({ Authorization: `bearer ${await tokenDeCliente()}` }),
    );

    expect(resposta.isAuthorized).toBe(true);
  });

  it("propaga o correlationId recebido", async () => {
    const resposta = await handler(
      evento({
        authorization: `Bearer ${await tokenDeCliente()}`,
        "x-correlation-id": "abc-123",
      }),
    );

    expect(resposta.context.correlationId).toBe("abc-123");
  });
});

describe("nega", () => {
  it("quando nao ha cabecalho de autorizacao", async () => {
    const resposta = await handler(evento({}));

    expect(resposta.isAuthorized).toBe(false);
    expect(resposta.context).toEqual({});
  });

  it("quando o cabecalho nao usa o esquema Bearer", async () => {
    const resposta = await handler(evento({ authorization: "Basic YWJjOjEyMw==" }));

    expect(resposta.isAuthorized).toBe(false);
  });

  it("quando o Bearer vem vazio", async () => {
    expect((await handler(evento({ authorization: "Bearer   " }))).isAuthorized).toBe(
      false,
    );
  });

  it("quando o token esta expirado", async () => {
    const token = await tokenDeCliente({ expiraEm: Math.floor(Date.now() / 1000) - 60 });

    expect((await handler(evento({ authorization: `Bearer ${token}` }))).isAuthorized).toBe(
      false,
    );
  });

  it("quando o token foi assinado com outro segredo", async () => {
    const token = await tokenDeCliente({ segredo: OUTRO_SEGREDO });

    expect((await handler(evento({ authorization: `Bearer ${token}` }))).isAuthorized).toBe(
      false,
    );
  });

  it("quando o token nao e um JWT", async () => {
    expect(
      (await handler(evento({ authorization: "Bearer nao-e-um-jwt" }))).isAuthorized,
    ).toBe(false);
  });

  it("quando falta o segredo no ambiente", async () => {
    const token = await tokenDeCliente();
    vi.stubEnv("SECURITY_JWT_SECRET", "");

    expect((await handler(evento({ authorization: `Bearer ${token}` }))).isAuthorized).toBe(
      false,
    );
  });
});
