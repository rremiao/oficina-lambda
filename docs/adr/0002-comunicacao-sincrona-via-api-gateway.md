# ADR-0002 — Comunicação síncrona HTTP via API Gateway, sem mensageria

## Status

Aceito

## Contexto

O desafio menciona adotar soluções serverless para autenticação e notificações. A autenticação é
requisito obrigatório e está implementada aqui. Restava decidir o padrão de comunicação entre o
consumidor, este componente e a aplicação no EKS: síncrono sobre HTTP, ou assíncrono com fila.

## Alternativas consideradas

| Opção | Prós | Contras |
|---|---|---|
| **HTTP síncrono via API Gateway** | O cliente precisa do token na mesma requisição; depuração trivial com curl/Postman; contrato visível no OpenAPI | Latência da function entra no caminho crítico |
| SQS/SNS entre Gateway e function | Desacopla e absorve pico | Não funciona para autenticação: o cliente não pode "receber o token depois". Introduziria polling ou webhook sem ganho |
| EventBridge para eventos de negócio | Bom para notificações futuras | Nenhum fluxo atual é fire-and-forget; seria infraestrutura sem consumidor |

## Decisão

Toda a comunicação deste componente é **síncrona sobre HTTP/JSON**, mediada pelo API Gateway. Não há
fila, tópico nem processamento assíncrono neste repositório.

## Justificativa

1. **Autenticação é inerentemente síncrona.** O cliente manda o CPF e precisa do token na resposta;
   não existe versão assíncrona útil desse fluxo.
2. **O `authorizer` é ainda mais síncrono**: o Gateway bloqueia a requisição esperando o `Allow` ou
   `Deny`. Fila ali seria impossível por construção.
3. **Notificações não foram implementadas.** O enunciado cita notificações na descrição do desafio,
   mas a lista de requisitos obrigatórios pede function serverless apenas para autenticação. Se
   notificações entrarem no escopo, aí sim o padrão assíncrono (SNS/SQS) seria a escolha — e seria
   uma decisão nova, não coberta por este ADR.

## Consequências

- **Positivas**: latência fim a fim visível e mensurável; contrato simples de testar e documentar;
  nenhuma infraestrutura de mensageria para operar.
- **Negativas / trade-offs**:
  - Indisponibilidade do RDS vira `503` imediato para o cliente — não há retentativa nem
    enfileiramento. É comportamento desejado para login, mas é uma escolha.
  - O caminho crítico soma a latência do Gateway, da function e do banco. O cache do authorizer
    (300s) e a conexão reaproveitada mitigam, mas não eliminam.
