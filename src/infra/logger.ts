/**
 * Log estruturado em JSON.
 *
 * O CloudWatch indexa cada linha como um objeto, e o `correlationId` é o que permite seguir uma
 * requisição do Gateway até a aplicação no EKS.
 */

import { createHash } from "node:crypto";

export type Nivel = "info" | "warn" | "error";

export interface Contexto {
  correlationId: string;
  evento: string;
  [chave: string]: unknown;
}

const SERVICO = "oficina-auth-token";

export function registrar(nivel: Nivel, contexto: Contexto): void {
  const linha = JSON.stringify({
    timestamp: new Date().toISOString(),
    level: nivel,
    service: SERVICO,
    ...contexto,
  });

  if (nivel === "error") {
    console.error(linha);
    return;
  }

  console.log(linha);
}

/**
 * Identifica um CPF no log sem expô-lo.
 *
 * O hash truncado permite correlacionar tentativas do mesmo documento sem gravar dado pessoal.
 */
export function digitalDoCpf(cpf: string): string {
  return createHash("sha256").update(cpf).digest("hex").slice(0, 12);
}
