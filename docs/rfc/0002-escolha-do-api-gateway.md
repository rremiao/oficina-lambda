# RFC-0002 — Escolha do API Gateway: AWS API Gateway HTTP API (v2)

## Status

Aceito

## Contexto

O desafio exige um API Gateway para controle e roteamento, com liberdade de escolha (AWS API
Gateway, Kong, Traefik ou outro). O Gateway precisa cumprir três papéis neste projeto: expor a rota
de emissão de token integrada a uma Lambda, proteger as demais rotas validando o JWT antes que a
requisição chegue ao cluster, e encaminhar o restante para o LoadBalancer do Service da API no EKS.

O ambiente é o AWS Academy Learner Lab, que não permite criar roles nem policies IAM novas.

## Alternativas consideradas

| Opção | Prós | Contras |
|---|---|---|
| **AWS API Gateway HTTP API (v2)** | Integração nativa `AWS_PROXY` com Lambda e `HTTP_PROXY` com o LoadBalancer; Lambda Authorizer com *simple response* e cache; access log estruturado; provisionável pela `LabRole` existente | Menos recursos que a REST API v1 (sem WAF nativo, sem *request validation* por modelo) |
| AWS API Gateway REST API (v1) | Mais recursos: validação por modelo, planos de uso, WAF | Mais caro por requisição, configuração mais verbosa, e nenhum dos recursos extras é exigido pelo desafio |
| Kong / Traefik no próprio EKS | Independente de nuvem; mais controle | Passaria a ser mais um componente para operar, escalar e monitorar dentro do cluster — e consumiria nodes do Lab, que já são apertados. Não teria integração nativa com Lambda |
| Application Load Balancer com regras | Já existiria no cluster | Não invoca Lambda nem valida JWT; precisaria de um serviço extra para autenticar |

## Decisão

**AWS API Gateway HTTP API (v2)**, provisionado por Terraform neste repositório
(`infra/apigateway.tf`), com três tipos de rota:

| Rota | Integração | Autorização |
|---|---|---|
| `POST /auth/token` | `AWS_PROXY` → Lambda `auth-token` | `NONE` |
| 6 rotas de `local.rotas_abertas` | `HTTP_PROXY` → LoadBalancer | `NONE` |
| `$default` (todo o resto) | `HTTP_PROXY` → LoadBalancer | `CUSTOM` (Lambda Authorizer) |

As rotas abertas são o login de operador (`POST /oficina/v1/auth/login`), `/public/{proxy+}`,
e os caminhos do Swagger UI e do OpenAPI. O cadastro de usuários (`/oficina/v1/usuarios`) fica
deliberadamente **sob** o authorizer.

## Justificativa

1. **É a única opção que integra Lambda e backend HTTP sem componente intermediário.** Kong ou
   Traefik precisariam de um serviço próprio para chamar a function.
2. **Custo e permissões.** O HTTP API é mais barato que o REST API e sobe inteiro com a `LabRole`,
   sem exigir criação de role, que o Learner Lab bloqueia.
3. **O login de operador precisava ficar aberto.** É a troca de credencial por token: não existe
   token para o authorizer validar antes dela. Mesma razão de `POST /auth/token`.
4. **A rota `$default` não declara caminho na integração** (`integration_uri = "http://<lb-dns>"`).
   Na `$default` o Gateway repassa o caminho inteiro da requisição; usar `{proxy}` ali seria erro,
   porque essa variável não existe nessa rota.

## Consequências

- **Positivas**: uma única URL base para o consumidor; token inválido é barrado na borda, sem gastar
  recurso do cluster; access log em JSON com `correlationId` sai de graça, via `access_log_settings`.
- **Negativas / trade-offs**:
  - `backend_lb_dns` é um parâmetro, não um *data source*: o DNS do LoadBalancer muda toda vez que o
    Service do EKS é recriado, e o Terraform precisa ser reaplicado. É a pegadinha operacional mais
    comum do projeto.
  - O API Gateway v2 **recusa criar a integração se o DNS tiver TLD inválido** (por exemplo
    `algo.invalid`), quebrando o `apply` — por isso o `deploy.yml` falha de propósito quando o
    `.tfvars` ainda está com o valor de exemplo `SUBSTITUIR-...`.
  - Sem WAF e sem *rate limit* por consumidor: existe apenas o throttling global do stage
    (100 req/s, burst 50).
