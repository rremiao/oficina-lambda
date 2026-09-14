/**
 * Validação de CPF, espelhando `ValidadorCPF` da API Spring.
 *
 * As duas implementações precisam concordar: um CPF aceito aqui e recusado lá deixaria o cliente
 * com um token que a aplicação nunca honra.
 */

const TAMANHO = 11;

const APENAS_DIGITOS = /\D/g;

/** Remove pontuação e espaços, deixando só os dígitos, como a coluna `cpf_cnpj` é comparada. */
export function normalizarCpf(valor: string | null | undefined): string {
  if (typeof valor !== "string") {
    return "";
  }

  return valor.replace(APENAS_DIGITOS, "");
}

/**
 * Diz se o CPF é válido em tamanho, sequência e dígitos verificadores.
 *
 * Aceita o valor com ou sem máscara: a normalização acontece aqui dentro.
 */
export function cpfEhValido(valor: string | null | undefined): boolean {
  const cpf = normalizarCpf(valor);

  if (cpf.length !== TAMANHO) {
    return false;
  }

  if (todosOsDigitosIguais(cpf)) {
    return false;
  }

  return (
    calcularDigito(cpf, 9) === Number(cpf[9]) &&
    calcularDigito(cpf, 10) === Number(cpf[10])
  );
}

/** `111.111.111-11` e afins passam nos dígitos verificadores, mas não são CPFs reais. */
function todosOsDigitosIguais(cpf: string): boolean {
  return cpf.split("").every((digito) => digito === cpf[0]);
}

/**
 * Calcula um dígito verificador sobre os `quantidade` primeiros dígitos.
 *
 * O peso começa em `quantidade + 1` e decresce, que é a mesma conta do validador em Java.
 */
function calcularDigito(cpf: string, quantidade: number): number {
  let soma = 0;

  for (let i = 0; i < quantidade; i += 1) {
    soma += Number(cpf[i]) * (quantidade + 1 - i);
  }

  const digito = 11 - (soma % 11);

  return digito >= 10 ? 0 : digito;
}
