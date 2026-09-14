/**
 * Erros de negócio do fluxo de emissão do token.
 *
 * Cada erro carrega o código e o status HTTP do contrato, para que o handler não precise decidir
 * nada: ele só traduz o erro em resposta.
 */

export type CodigoErro =
  | "CPF_INVALIDO"
  | "CLIENTE_NAO_ENCONTRADO"
  | "CLIENTE_INATIVO"
  | "BASE_INDISPONIVEL";

export class ErroDeNegocio extends Error {
  readonly codigo: CodigoErro;
  readonly status: number;

  constructor(codigo: CodigoErro, status: number, mensagem: string) {
    super(mensagem);
    this.name = "ErroDeNegocio";
    this.codigo = codigo;
    this.status = status;
  }
}

export function cpfInvalido(): ErroDeNegocio {
  return new ErroDeNegocio(
    "CPF_INVALIDO",
    400,
    "Informe um CPF valido, com ou sem pontuacao.",
  );
}

export function clienteNaoEncontrado(): ErroDeNegocio {
  return new ErroDeNegocio(
    "CLIENTE_NAO_ENCONTRADO",
    404,
    "Nenhum cliente cadastrado com este CPF.",
  );
}

export function clienteInativo(): ErroDeNegocio {
  return new ErroDeNegocio(
    "CLIENTE_INATIVO",
    403,
    "O cadastro deste cliente esta inativo.",
  );
}

export function baseIndisponivel(): ErroDeNegocio {
  return new ErroDeNegocio(
    "BASE_INDISPONIVEL",
    503,
    "Nao foi possivel consultar a base de clientes. Tente novamente.",
  );
}
