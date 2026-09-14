/**
 * Conexão com o RDS reaproveitada entre invocações.
 *
 * O client vive fora do handler porque a Lambda congela o processo entre chamadas: reconectar a
 * cada invocação somaria centenas de milissegundos e esgotaria as conexões do `db.t3.micro`.
 */

import pg from "pg";

import type { ConfiguracaoBanco } from "../config.js";

/** Curto de propósito: a função tem 10 s de timeout e precisa responder 503 antes disso. */
const TIMEOUT_DE_CONEXAO_EM_MS = 3_000;

const TIMEOUT_DE_CONSULTA_EM_MS = 3_000;

let conexao: pg.Client | null = null;

export async function obterConexao(
  configuracao: ConfiguracaoBanco,
): Promise<pg.Client> {
  if (conexao !== null) {
    return conexao;
  }

  const cliente = new pg.Client({
    host: configuracao.host,
    port: configuracao.porta,
    database: configuracao.nome,
    user: configuracao.usuario,
    password: configuracao.senha,
    connectionTimeoutMillis: TIMEOUT_DE_CONEXAO_EM_MS,
    query_timeout: TIMEOUT_DE_CONSULTA_EM_MS,
    ssl: configuracao.ssl ? { rejectUnauthorized: false } : false,
  });

  // Sem este listener, uma queda de conexão derruba o processo inteiro da Lambda. Com ele, a
  // conexão é descartada e a próxima invocação abre outra.
  cliente.on("error", () => {
    conexao = null;
  });

  await cliente.connect();

  conexao = cliente;

  return cliente;
}

/** Descarta a conexão atual, para que a próxima invocação abra uma nova. */
export async function encerrarConexao(): Promise<void> {
  const atual = conexao;

  conexao = null;

  if (atual !== null) {
    await atual.end().catch(() => undefined);
  }
}
