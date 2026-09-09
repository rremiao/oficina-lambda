/**
 * `POST /auth/token` — emite o JWT do cliente a partir do CPF.
 *
 * Ordem dos passos ditada pelo enunciado: validar o CPF, confirmar que o cliente existe e está
 * ativo na base, e só então assinar o token.
 */

import { randomUUID } from "node:crypto";

import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";

import { carregarConfiguracao } from "../config.js";
import { cpfEhValido, normalizarCpf } from "../domain/cpf.js";
import {
  ErroDeNegocio,
  baseIndisponivel,
  clienteInativo,
  clienteNaoEncontrado,
  cpfInvalido,
} from "../domain/erros.js";
import { buscarClientePorCpf } from "../infra/clienteRepository.js";
import { obterConexao } from "../infra/db.js";
import { assinarTokenDeCliente } from "../infra/jwt.js";
import { digitalDoCpf, registrar } from "../infra/logger.js";

const CABECALHO_CORRELACAO = "x-correlation-id";

export async function handler(
  evento: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const correlationId = correlacaoDe(evento);
  const inicio = Date.now();

  try {
    const cpf = extrairCpf(evento);

    const resposta = await emitirToken(cpf, correlationId);

    registrar("info", {
      correlationId,
      evento: "token_emitido",
      cpf: digitalDoCpf(cpf),
      duracaoMs: Date.now() - inicio,
      resultado: "sucesso",
    });

    return responder(200, resposta, correlationId);
  } catch (erro) {
    const negocio = comoErroDeNegocio(erro);

    registrar(negocio.status >= 500 ? "error" : "warn", {
      correlationId,
      evento: "token_recusado",
      erro: negocio.codigo,
      duracaoMs: Date.now() - inicio,
      resultado: "falha",
    });

    return responder(
      negocio.status,
      {
        erro: negocio.codigo,
        mensagem: negocio.message,
        correlationId,
      },
      correlationId,
    );
  }
}

async function emitirToken(cpf: string, correlationId: string) {
  const configuracao = carregarConfiguracao();

  let cliente;

  try {
    const conexao = await obterConexao(configuracao.banco);

    cliente = await buscarClientePorCpf(conexao, cpf);
  } catch (erro) {
    registrar("error", {
      correlationId,
      evento: "falha_no_banco",
      detalhe: erro instanceof Error ? erro.message : String(erro),
    });

    throw baseIndisponivel();
  }

  if (cliente === null) {
    throw clienteNaoEncontrado();
  }

  if (!cliente.ativo) {
    throw clienteInativo();
  }

  const { token, expiraEm } = await assinarTokenDeCliente(
    { cpf, clienteId: cliente.id, nome: cliente.nome },
    configuracao.jwt,
  );

  return {
    token,
    tipo: "Bearer",
    expiraEm,
    cliente: { id: cliente.id, nome: cliente.nome },
  };
}

/** Aceita CPF com ou sem máscara; qualquer outra coisa é recusada como CPF inválido. */
function extrairCpf(evento: APIGatewayProxyEventV2): string {
  const corpo = lerCorpo(evento);

  if (corpo === null || typeof corpo.cpf !== "string") {
    throw cpfInvalido();
  }

  if (!cpfEhValido(corpo.cpf)) {
    throw cpfInvalido();
  }

  return normalizarCpf(corpo.cpf);
}

function lerCorpo(
  evento: APIGatewayProxyEventV2,
): Record<string, unknown> | null {
  if (evento.body === undefined || evento.body === null) {
    return null;
  }

  const bruto = evento.isBase64Encoded
    ? Buffer.from(evento.body, "base64").toString("utf8")
    : evento.body;

  try {
    const corpo: unknown = JSON.parse(bruto);

    return typeof corpo === "object" && corpo !== null
      ? (corpo as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Herda o `correlationId` de quem chamou, quando existir.
 *
 * Sem isso a correlação quebra logo no primeiro salto e o log do Gateway não conversa com o da
 * aplicação.
 */
function correlacaoDe(evento: APIGatewayProxyEventV2): string {
  const doCabecalho = evento.headers?.[CABECALHO_CORRELACAO];

  if (typeof doCabecalho === "string" && doCabecalho.trim() !== "") {
    return doCabecalho;
  }

  return evento.requestContext?.requestId ?? randomUUID();
}

function comoErroDeNegocio(erro: unknown): ErroDeNegocio {
  if (erro instanceof ErroDeNegocio) {
    return erro;
  }

  // Configuração ausente ou falha inesperada: para quem chamou, a base está indisponível.
  return baseIndisponivel();
}

function responder(
  status: number,
  corpo: unknown,
  correlationId: string,
): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode: status,
    headers: {
      "content-type": "application/json",
      [CABECALHO_CORRELACAO]: correlationId,
    },
    body: JSON.stringify(corpo),
  };
}
