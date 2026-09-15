# RFC-0003 — Runtime e empacotamento: Node.js 22 + esbuild

## Status

Aceito

## Contexto

As functions deste repositório rodam no caminho crítico de toda requisição autenticada: a
`auth-token` no login e a `authorizer` em **cada** requisição protegida que não esteja em cache. Cold
start e tamanho do pacote deixam de ser detalhe e viram latência percebida pelo usuário.

A aplicação principal é Java/Spring Boot, então havia a opção de manter a mesma linguagem no time.

## Alternativas consideradas

| Opção | Prós | Contras |
|---|---|---|
| **Node.js 22 + esbuild** | Cold start na casa de dezenas de milissegundos; bundle de poucas centenas de KB; `jose` e `pg` são bibliotecas maduras | Linguagem diferente da aplicação principal — mais um ecossistema para o time manter |
| Java 17 (mesma stack da API) | Reaproveita a linguagem e a validação de CPF já escrita | Cold start de segundos numa function invocada a cada requisição protegida; pacote na casa de dezenas de MB. Inviável para o `authorizer` |
| Python 3.12 | Cold start baixo, boa biblioteca de JWT | Nenhuma vantagem sobre Node no caso de uso, e o time tinha mais familiaridade com TypeScript |
| Container image na Lambda | Controle total do ambiente | Cold start maior que o do zip; exigiria ECR e mais um passo na pipeline |

## Decisão

**Node.js 22 (`nodejs22.x`), TypeScript compilado com esbuild**, empacotado em um único
`function.zip` que contém os dois handlers.

O `build.mjs` varre `src/handlers/`, gera um bundle independente por arquivo em `dist/` e zipa o
resultado. O Terraform publica o **mesmo** zip nas duas functions, mudando apenas o `handler`
(`token.handler` e `authorizer.handler`).

## Justificativa

1. **O `authorizer` decide a latência do sistema inteiro.** Ele roda antes de toda requisição
   protegida não cacheada; um cold start de segundos ali seria sentido em cada chamada.
2. **Bundle com dependências embutidas.** A Lambda roda sem `node_modules`; o esbuild resolve isso
   no build e dispensa layer de dependências.
3. **Um zip, duas functions.** Evita divergência de versão entre `auth-token` e `authorizer`, que
   compartilham `config.ts`, `jwt.ts` e `logger.ts`. Um deploy publica os dois em estado consistente
   — e o `ci.yml` confere que os dois handlers estão dentro do pacote antes de aprovar o PR.
4. **A duplicação da validação de CPF é aceita conscientemente** (ver RFC-0001): o mesmo algoritmo
   existe em Java na aplicação e em TypeScript aqui. `tests/cpf.test.ts` existe justamente para
   travar esse comportamento.

## Consequências

- **Positivas**: cold start e custo baixos; pipeline simples (`npm ci && npm test && npm run build`);
  testes unitários rodam em segundos, sem AWS.
- **Negativas / trade-offs**:
  - Duas linguagens no projeto. Uma mudança no contrato do token exige mexer em Java e TypeScript.
  - `source_code_hash = filebase64sha256(local.pacote)` obriga o `function.zip` a existir antes do
    `terraform apply`: rodar o `apply` sem `npm run build` falha.
  - Testes de integração (`*.integration.ts`) ficam fora do `npm test` de propósito — precisam de um
    Postgres real via Docker, o que não cabe no CI do Learner Lab.
