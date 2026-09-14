# RFC-0004 — Observabilidade: CloudWatch Logs, métricas e alarmes

## Status

Aceito

## Contexto

O desafio exige logs estruturados em JSON com correlação entre requisições, além de alertas para
falhas. No caso destas functions há uma restrição de domínio que não existe nos outros componentes:
o dado que entra é **CPF**, dado pessoal que não pode aparecer em log.

Além disso, uma requisição atravessa quatro pontos (Gateway → authorizer → LoadBalancer → aplicação
no EKS), cada um escrevendo em um lugar diferente.

## Alternativas consideradas

| Opção | Prós | Contras |
|---|---|---|
| **CloudWatch Logs estruturado + alarmes, com `correlationId`** | Já é o destino natural do stdout da Lambda; sem dependência externa; alarmes no mesmo lugar das métricas | Consulta por `filter-log-events` é mais pobre que um APM; retenção custa dinheiro se crescer |
| AWS X-Ray | Trace distribuído pronto, com waterfall visual | Exigiria instrumentar também a aplicação Java; permissões do Learner Lab são incertas para o daemon |
| Só o log padrão da Lambda (texto) | Zero trabalho | Não correlaciona nada e não atende ao requisito de log estruturado |

## Decisão

Log estruturado em JSON escrito por `src/infra/logger.ts`, com `timestamp`, `level`, `service`,
`correlationId` e `evento` em cada linha, mais **três log groups criados pelo Terraform** (não pela
primeira invocação, para que a retenção de 7 dias valha desde o começo) e **cinco alarmes** de
CloudWatch.

### Proteção do dado pessoal

O CPF **nunca** é gravado em claro. A função `digitalDoCpf` grava um SHA-256 truncado em 12
caracteres, o que permite correlacionar tentativas do mesmo documento sem expor o dado. No
`authorizer`, o log de falha registra apenas `erro.name` (por exemplo `JWTExpired`) em vez da
mensagem completa, que poderia carregar pedaços do token.

### Correlação

O `correlationId` é herdado do cabeçalho `x-correlation-id` quando existe, senão cai para o
`requestId` do Gateway. O `authorizer` devolve o valor no `context` da resposta, e a integração do
`$default` reinjeta esse valor no cabeçalho enviado ao backend
(`overwrite:header.x-correlation-id = $context.authorizer.correlationId`). Sem esse repasse, a
corrente quebraria no Gateway e o log da aplicação teria um identificador diferente.

### Alarmes

| Alarme | Dispara quando |
|---|---|
| `Errors` (por function) | ≥ 1 erro de execução em 5 min |
| `Duration p95` (por function) | p95 acima de 3000 ms na `auth-token` ou 1000 ms no `authorizer`, por 2 períodos |
| `Throttles` (`auth-token`) | ≥ 1 invocação estrangulada em 5 min |
| `5xx` do API Gateway | ≥ 5 respostas 5xx em 5 min |

## Justificativa

1. **Erro de execução é diferente de recusa de negócio.** Um `404` de cliente inexistente é resposta
   esperada e não conta como erro — por isso o alarme observa a métrica `Errors` da Lambda, não o
   status HTTP.
2. **O alarme de `Throttles` cobre um sintoma silencioso.** Com concorrência reservada (ADR-0004), o
   estrangulamento apareceria para o usuário como "não consigo pegar token", sem nenhum erro na
   function.
3. **Alarme sem destino ainda tem valor.** `alarme_sns_topic_arn` vazio cria o alarme sem ação de
   notificação: ele continua visível no console. O Learner Lab nem sempre permite criar SNS.

## Consequências

- **Positivas**: uma requisição é rastreável nos quatro pontos com um `grep` do mesmo valor; os
  alarmes cobrem falha, lentidão e estrangulamento; nenhum dado pessoal em log.
- **Negativas / trade-offs**:
  - Retenção de 7 dias: investigação post-mortem além disso não tem dado.
  - Se o `request_parameters` da integração `$default` for removido, a correlação quebra em silêncio
    — os três continuam logando, com identificadores diferentes.
  - O `correlationId` vem do cliente quando enviado; um cliente malicioso pode repetir o mesmo valor
    em requisições distintas. Para efeito de depuração é aceitável, mas não serve como identificador
    único confiável de requisição.
