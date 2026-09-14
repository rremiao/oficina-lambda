# ADR-0003 — Organização dos logs e da correlação de requisições

## Status

Aceito

## Contexto

Uma requisição autenticada atravessa quatro pontos que escrevem log em lugares diferentes: o access
log do API Gateway, a function `authorizer`, a function `auth-token` (no fluxo de emissão) e a
aplicação Spring no EKS. Sem um identificador comum, reconstruir o que aconteceu com uma requisição
específica vira comparação de horários.

Há também uma restrição de domínio: o dado de entrada é CPF.

## Decisão

Um identificador único no cabeçalho **`x-correlation-id`** atravessa os quatro pontos, e todo log
deste repositório é JSON de uma linha, escrito por `src/infra/logger.ts` com os campos `timestamp`,
`level`, `service`, `correlationId` e `evento`.

A corrente funciona assim:

1. As functions herdam o `x-correlation-id` do cabeçalho quando presente; senão usam o `requestId`
   do Gateway (ou um UUID).
2. O `authorizer` devolve o valor no `context` da *simple response*.
3. A integração da rota `$default` reinjeta esse valor no cabeçalho enviado ao backend:
   `overwrite:header.x-correlation-id = $context.authorizer.correlationId`.
4. O `CorrelationIdFilter` da aplicação lê o cabeçalho, coloca no MDC e o imprime em toda linha do
   log estruturado ECS.

O access log do stage do Gateway também é JSON e carrega o mesmo campo.

## Justificativa

1. **Sem o passo 3 a corrente quebraria no Gateway.** O backend geraria o próprio identificador e os
   logs não conversariam.
2. **CPF nunca em claro.** `digitalDoCpf` grava um SHA-256 truncado em 12 caracteres — o suficiente
   para correlacionar tentativas do mesmo documento sem gravar dado pessoal.
3. **O log de falha do authorizer registra `erro.name`, não a mensagem.** O nome do erro do `jose`
   (`JWTExpired`, `JWSSignatureVerificationFailed`) já diz o suficiente; a mensagem completa poderia
   carregar pedaços do token.
4. **Erro é `console.error`, o resto é `console.log`.** Separa o que merece alarme do que é ruído
   esperado.

## Consequências

- **Positivas**: uma requisição é rastreável ponta a ponta com o mesmo valor nos quatro lugares; o
  CloudWatch indexa cada linha como objeto, permitindo filtro por campo.
- **Negativas / trade-offs**:
  - O `correlationId` é aceito do cliente. Um cliente pode repetir o mesmo valor em requisições
    diferentes: serve para depuração, não como identificador único garantido.
  - A correlação depende de uma linha de `request_parameters` no Terraform. Se ela sumir, tudo
    continua funcionando e logando — só deixa de correlacionar, sem erro visível.
  - A digital do CPF é determinística e sem *salt*: quem tiver a lista de CPFs candidatos consegue
    reverter por força bruta. É aceitável para log de depuração com retenção de 7 dias, mas não
    seria suficiente como técnica de anonimização.
