/**
 * Leitura e validação das variáveis de ambiente da function.
 *
 * A Lambda roda em subnet sem NAT, então não há Secrets Manager: tudo chega por variável de
 * ambiente, definida pelo Terraform a partir dos secrets do GitHub.
 */

export interface ConfiguracaoBanco {
  host: string;
  porta: number;
  nome: string;
  usuario: string;
  senha: string;
  /** O RDS exige TLS; um PostgreSQL local de teste normalmente não o oferece. */
  ssl: boolean;
}

export interface ConfiguracaoJwt {
  segredo: string;
  validadeEmSegundos: number;
}

export interface Configuracao {
  banco: ConfiguracaoBanco;
  jwt: ConfiguracaoJwt;
}

/** Mesmo valor do `security.jwt.expiration` da API Spring, em milissegundos. */
const VALIDADE_PADRAO_EM_MS = 7_200_000;

/**
 * Configuração do JWT isolada da do banco.
 *
 * O authorizer não toca no RDS: exigir as variáveis do banco nele faria a função falhar por uma
 * dependência que ela não tem.
 */
export function carregarConfiguracaoJwt(
  ambiente: NodeJS.ProcessEnv = process.env,
): ConfiguracaoJwt {
  return {
    segredo: obrigatoria(ambiente, "SECURITY_JWT_SECRET"),
    validadeEmSegundos: Math.floor(
      Number(ambiente.SECURITY_JWT_EXPIRATION ?? VALIDADE_PADRAO_EM_MS) / 1000,
    ),
  };
}

export function carregarConfiguracao(
  ambiente: NodeJS.ProcessEnv = process.env,
): Configuracao {
  return {
    banco: {
      host: obrigatoria(ambiente, "DB_HOST"),
      porta: Number(ambiente.DB_PORT ?? 5432),
      nome: obrigatoria(ambiente, "DB_NAME"),
      usuario: obrigatoria(ambiente, "DB_USER"),
      senha: obrigatoria(ambiente, "DB_PASSWORD"),
      ssl: (ambiente.DB_SSL ?? "true") !== "false",
    },
    jwt: carregarConfiguracaoJwt(ambiente),
  };
}

/**
 * Falha alto e cedo quando falta uma variável.
 *
 * É melhor a invocação estourar com o nome da variável do que a função responder 503 e deixar a
 * causa escondida num erro de conexão.
 */
function obrigatoria(ambiente: NodeJS.ProcessEnv, nome: string): string {
  const valor = ambiente[nome];

  if (valor === undefined || valor.trim() === "") {
    throw new Error(`Variavel de ambiente obrigatoria ausente: ${nome}`);
  }

  return valor;
}
