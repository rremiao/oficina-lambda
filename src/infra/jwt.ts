/**
 * Assinatura do token de cliente.
 *
 * HS256 com o mesmo segredo do `security.jwt.secret` da API Spring, porque é o filtro dela que vai
 * verificar a assinatura. Qualquer divergência aqui vira 403 do outro lado.
 */

import { SignJWT, jwtVerify } from "jose";

import type { ConfiguracaoJwt } from "../config.js";

export interface DadosDoToken {
  cpf: string;
  clienteId: number;
  nome: string;
}

export interface TokenEmitido {
  token: string;
  expiraEm: string;
}

export async function assinarTokenDeCliente(
  dados: DadosDoToken,
  configuracao: ConfiguracaoJwt,
): Promise<TokenEmitido> {
  const emitidoEm = Math.floor(Date.now() / 1000);
  const expiraEm = emitidoEm + configuracao.validadeEmSegundos;

  const token = await new SignJWT({
    tipo: "CLIENTE",
    clienteId: dados.clienteId,
    nome: dados.nome,
    role: "CLIENTE",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(dados.cpf)
    .setIssuedAt(emitidoEm)
    .setExpirationTime(expiraEm)
    .sign(new TextEncoder().encode(configuracao.segredo));

  return { token, expiraEm: new Date(expiraEm * 1000).toISOString() };
}

export interface ClienteDoToken {
  cpf: string;
  clienteId: number | null;
  tipo: string;
}

/**
 * Verifica assinatura e expiração de um token já emitido.
 *
 * O algoritmo é fixado em HS256 de propósito: aceitar o que vier no cabeçalho abriria a porta para
 * um token assinado com `alg: none`.
 */
export async function verificarToken(
  token: string,
  configuracao: ConfiguracaoJwt,
): Promise<ClienteDoToken> {
  const { payload } = await jwtVerify(
    token,
    new TextEncoder().encode(configuracao.segredo),
    { algorithms: ["HS256"] },
  );

  return {
    cpf: payload.sub ?? "",
    clienteId: typeof payload.clienteId === "number" ? payload.clienteId : null,
    // Tokens emitidos antes da claim existir só podiam ser de operador, mesma leitura que a API faz.
    tipo: typeof payload.tipo === "string" ? payload.tipo : "OPERADOR",
  };
}
