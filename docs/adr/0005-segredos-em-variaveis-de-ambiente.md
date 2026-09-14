# ADR-0005 — Segredos em variáveis de ambiente da Lambda, não no Secrets Manager

## Status

Aceito

## Contexto

As functions precisam de dois segredos: a senha do banco (`DB_PASSWORD`, só na `auth-token`) e o
segredo HS256 (`SECURITY_JWT_SECRET`, nas duas). O caminho canônico na AWS seria o Secrets Manager
ou o Parameter Store.

Duas restrições pesam aqui. A primeira é de rede: a `auth-token` roda em subnets da VPC default
**sem NAT Gateway**, então não alcança endpoints públicos da AWS — e não há VPC endpoint para o
Secrets Manager provisionado. A segunda é de permissão: o Learner Lab não permite criar roles nem
policies, e a `LabRole` usada pelas functions não tem política específica para ler um segredo.

## Alternativas consideradas

| Opção | Prós | Contras |
|---|---|---|
| **Variáveis de ambiente, preenchidas pelo Terraform a partir de secrets do GitHub** | Funciona sem NAT e sem policy nova; valor nunca aparece no código nem no repositório | O valor fica visível no console da Lambda para quem tem permissão de leitura, e no state do Terraform |
| AWS Secrets Manager | Rotação gerenciada, auditoria de acesso | Exigiria NAT Gateway ou VPC endpoint (custo) e uma policy IAM que o Lab não deixa criar |
| SSM Parameter Store (SecureString) | Mais barato que o Secrets Manager | Mesmas duas restrições: alcance de rede e permissão |
| Segredo embutido no pacote | Nenhum | Segredo no repositório. Descartado de imediato |

## Decisão

Os segredos chegam como **variáveis de ambiente das functions**, definidas pelo Terraform a partir
de `TF_VAR_db_password` e `TF_VAR_jwt_secret`, que por sua vez vêm dos secrets do repositório no
GitHub (`DB_PASSWORD` e `SECURITY_JWT_SECRET`).

As variáveis são marcadas `sensitive = true` no `variables.tf`, e `jwt_secret` tem validação de
tamanho mínimo (32 caracteres). Localmente, `infra/.env` (ignorado pelo git) exporta os mesmos
valores.

## Justificativa

1. **É a única opção que funciona na topologia atual.** Sem NAT e sem VPC endpoint, a `auth-token`
   simplesmente não alcança o Secrets Manager — a chamada daria timeout.
2. **`config.ts` falha alto e cedo.** A função `obrigatoria()` estoura com o nome da variável ausente
   em vez de deixar a function responder `503` com a causa escondida num erro de conexão.
3. **O `authorizer` carrega só o que usa.** `carregarConfiguracaoJwt` é separada de
   `carregarConfiguracao` justamente para que o authorizer não exija as variáveis de banco, que ele
   não tem nem precisa.

## Consequências

- **Positivas**: nenhum segredo no repositório; deploy funciona dentro das permissões do Lab; o
  mesmo padrão vale para a license key do New Relic (ADR-0007).
- **Negativas / trade-offs**:
  - O valor fica legível no console da Lambda e **no state do Terraform**, que vive num bucket S3.
    O bucket é privado e versionado, mas quem tiver acesso a ele tem acesso aos segredos.
  - Não há rotação automática. Trocar o segredo HS256 exige atualizar o secret do GitHub, reaplicar
    este Terraform **e** atualizar o Secret do Kubernetes no `oficina-kubernetes`, nessa ordem —
    enquanto estiverem diferentes, tokens emitidos são recusados pela aplicação.
  - Sem auditoria de leitura: não há registro de quem consultou o segredo.
