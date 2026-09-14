/**
 * Lambda Authorizer do API Gateway.
 *
 * Primeira das duas verificações do token. A segunda é o filtro da API Spring, e a repetição é
 * intencional: o LoadBalancer do EKS é público, então o Gateway sozinho não seria uma fronteira
 * real de segurança.
 *
 * Esta função fica fora da VPC de propósito. Ela não consulta o banco, e ficar fora evita somar
 * cold start de ENI a toda requisição protegida.
 */

import type { APIGatewayRequestAuthorizerEventV2 } from "aws-lambda";

import { carregarConfiguracaoJwt } from "../config.js";
import { verificarToken } from "../infra/jwt.js";
import { registrar } from "../infra/logger.js";

const PREFIXO_BEARER = /^Bearer\s+/i;

export interface RespostaDoAuthorizer {
  isAuthorized: boolean;
  context: Record<string, string>;
}

export async function handler(
  evento: APIGatewayRequestAuthorizerEventV2,
): Promise<RespostaDoAuthorizer> {
  const correlationId =
    cabecalho(evento, "x-correlation-id") ??
    evento.requestContext?.requestId ??
    "sem-correlacao";

  const inicio = Date.now();

  const token = extrairToken(evento);

  if (token === null) {
    registrar("warn", {
      correlationId,
      evento: "autorizacao_negada",
      motivo: "token_ausente",
      duracaoMs: Date.now() - inicio,
      resultado: "negado",
    });

    return negar();
  }

  try {
    const cliente = await verificarToken(token, carregarConfiguracaoJwt());

    registrar("info", {
      correlationId,
      evento: "autorizacao_concedida",
      tipo: cliente.tipo,
      duracaoMs: Date.now() - inicio,
      resultado: "autorizado",
    });

    return {
      isAuthorized: true,
      // O Gateway serializa o contexto como texto; a API revalida o token de qualquer forma, então
      // estes valores servem para log e correlação, não como fonte de autorização.
      context: {
        tipo: cliente.tipo,
        clienteId: cliente.clienteId === null ? "" : String(cliente.clienteId),
        correlationId,
      },
    };
  } catch (erro) {
    registrar("warn", {
      correlationId,
      evento: "autorizacao_negada",
      // O nome do erro do jose já diz o suficiente (expirado, assinatura inválida). A mensagem
      // completa poderia carregar pedaços do token para o log.
      motivo: erro instanceof Error ? erro.name : "token_invalido",
      duracaoMs: Date.now() - inicio,
      resultado: "negado",
    });

    return negar();
  }
}

/** Aceita o header em qualquer caixa: o Gateway normaliza, um teste local nem sempre. */
function extrairToken(evento: APIGatewayRequestAuthorizerEventV2): string | null {
  const bruto =
    cabecalho(evento, "authorization") ?? evento.identitySource?.[0] ?? null;

  if (bruto === null || !PREFIXO_BEARER.test(bruto)) {
    return null;
  }

  const token = bruto.replace(PREFIXO_BEARER, "").trim();

  return token === "" ? null : token;
}

function cabecalho(
  evento: APIGatewayRequestAuthorizerEventV2,
  nome: string,
): string | null {
  const cabecalhos = evento.headers ?? {};

  for (const [chave, valor] of Object.entries(cabecalhos)) {
    if (chave.toLowerCase() === nome && typeof valor === "string") {
      return valor;
    }
  }

  return null;
}

function negar(): RespostaDoAuthorizer {
  return { isAuthorized: false, context: {} };
}
