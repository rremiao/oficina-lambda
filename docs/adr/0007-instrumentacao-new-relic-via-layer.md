# ADR-0007 — Instrumentação das functions via New Relic Lambda Layer

## Status

Aceito

## Contexto

O Tech Challenge Fase 3 exige integração com uma ferramenta de observabilidade (Datadog, New Relic
ou equivalente). A escolha da ferramenta — New Relic, por causa da restrição de IAM do AWS Academy
Learner Lab e do free tier permanente — está documentada no
[ADR-0002 do repositório `oficina-kubernetes`](https://github.com/rremiao/oficina-kubernetes/blob/main/docs/adr/0002-escolha-da-ferramenta-de-observabilidade.md).
Este ADR trata da parte específica deste repositório: como instrumentar `auth-token` e `authorizer`,
que são funções Lambda, não um processo de longa duração onde caberia um agent de fundo.

## Alternativas consideradas

| Opção | Prós | Contras |
|---|---|---|
| **New Relic Lambda Layer + wrapper de handler** | Não exige alterar o código de `src/handlers/`; ativa/desativa só com uma variável Terraform | Acopla o deploy a uma layer publicada pela New Relic, específica de região/runtime |
| SDK do New Relic importado direto no código (`newrelic` npm package) | Mais controle sobre o que é instrumentado | Exigiria alterar `token.ts`/`authorizer.ts` e adicionar dependência de produção; mistura preocupação de observabilidade com lógica de negócio |
| Forwarder customizado lendo os log groups do CloudWatch (`observability.tf`) | Reaproveita infraestrutura já existente | Não dá cold start/duração/erro por invocação com a mesma granularidade do agent; teria que ser escrito do zero |

## Decisão

Usar a **New Relic Lambda Layer**, com o handler original preservado via a variável de ambiente
`NEW_RELIC_LAMBDA_HANDLER`, ativada apenas quando `var.newrelic_layer_arn` é preenchido (ver
`infra/main.tf`, `local.newrelic_habilitado`).

## Justificativa

1. **Zero alteração no código de aplicação**: `token.ts` e `authorizer.ts` continuam exportando
   `handler` normalmente. Quem muda é só a configuração Terraform da function (`handler`, `layers`,
   variáveis de ambiente) — consistente com a mesma abordagem de auto-instrumentação usada no EKS via
   `k8s-agents-operator` (ver `oficina-kubernetes`).
2. **Opcional por padrão**: enquanto a conta New Relic não estiver provisionada,
   `newrelic_layer_arn = ""` mantém o comportamento atual das functions, sem quebrar deploys
   existentes.
3. **Reaproveita os alarmes já existentes**: os alarmes de CloudWatch descritos no RFC-0004
   continuam funcionando em paralelo — a New Relic Layer não os substitui, complementa com traces e
   uma visão unificada junto do resto do ambiente (EKS, RDS).

## Consequências

- **Positivas**: cold start, duração e erros de cada invocação passam a aparecer no New Relic,
  correlacionados com o restante do ambiente (mesmo `NEW_RELIC_ACCOUNT_ID`).
- **Negativas / trade-offs**:
  - O ARN da layer (`var.newrelic_layer_arn`) precisa ser atualizado manualmente quando a New Relic
    publica uma nova versão — não há mecanismo automático de atualização.
  - A license key trafega como variável de ambiente da function (mesmo padrão já usado pra
    `SECURITY_JWT_SECRET`, justificado no ADR-0005) — não via AWS Secrets Manager, pela mesma razão
    de simplicidade dentro das restrições do Learner Lab.

## Validação

Testado numa implantação real: `terraform apply` com `newrelic_layer_arn` apontando pra
`arn:aws:lambda:us-east-1:451483290750:layer:NewRelicNodeJS22X:105` (arquitetura `x86_64`, mesma das
functions). O ARN certo pra região/runtime foi obtido via a API pública do New Relic, sem precisar de
nenhuma ferramenta adicional:

```bash
curl -s "https://us-east-1.layers.newrelic-external.com/get-layers?CompatibleRuntime=nodejs22.x"
```

Uma invocação real de `POST /auth/token` confirmou, no CloudWatch Logs da function, que a extension
inicializou e validou a license key antes mesmo do handler rodar:

```
[NR_EXT] INFO License key validated and extension registered - proceeding with full initialization
```

Sem impacto perceptível na duração da invocação nem nos logs estruturados existentes
(`correlationId` continuou presente normalmente).
