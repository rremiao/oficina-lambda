/**
 * Consulta do cliente por CPF no RDS.
 *
 * O enunciado pede a consulta direta na base, e não pela API: a rota de clientes é protegida, o
 * que criaria uma dependência circular de autenticação.
 */

import type pg from "pg";

export interface ClienteEncontrado {
  id: number;
  nome: string;
  ativo: boolean;
}

/**
 * A coluna `cpf_cnpj` guarda CPF ou CNPJ em formato livre, com ou sem máscara. Normalizar os dois
 * lados na comparação é o que evita não encontrar um cliente cadastrado com pontuação.
 */
const CONSULTA = `
  SELECT id, nome, ativo
    FROM cliente
   WHERE regexp_replace(cpf_cnpj, '\\D', '', 'g') = $1
   LIMIT 1
`;

/** Linha crua: `id` é `BIGSERIAL`, e o driver entrega `int8` como texto para não perder precisão. */
interface LinhaCliente {
  id: string | number;
  nome: string;
  ativo: boolean;
}

export async function buscarClientePorCpf(
  conexao: pg.Client,
  cpf: string,
): Promise<ClienteEncontrado | null> {
  const resultado = await conexao.query<LinhaCliente>(CONSULTA, [cpf]);

  const linha = resultado.rows[0];

  if (linha === undefined) {
    return null;
  }

  // A conversão não é cosmética: a claim `clienteId` precisa ser numérica, senão o filtro do
  // Spring rejeita o token ao ler a claim como número.
  return { id: Number(linha.id), nome: linha.nome, ativo: linha.ativo };
}
