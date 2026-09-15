# ADR-0006 — Isolamento de rede: `auth-token` dentro da VPC, `authorizer` fora

## Status

Aceito

## Contexto

As duas functions deste repositório têm necessidades de rede opostas:

- `auth-token` precisa alcançar o RDS `oficina-db`, que **não é público** — só é acessível de dentro
  da VPC.
- `authorizer` não fala com ninguém: recebe o token, verifica a assinatura com um segredo que já
  está na memória e devolve a decisão.

Colocar uma Lambda dentro da VPC tem um custo conhecido: a function precisa de uma ENI, e isso soma
tempo ao cold start.

## Alternativas consideradas

| Opção | Prós | Contras |
|---|---|---|
| **`auth-token` na VPC, `authorizer` fora** | Cada uma paga só o custo de que precisa | Duas configurações de rede diferentes no mesmo repositório — exige explicação (este ADR) |
| As duas dentro da VPC | Configuração uniforme | O `authorizer` roda a cada requisição protegida; somar cold start de ENI ali afeta toda a API sem nenhum benefício |
| As duas fora da VPC | Cold start mínimo nas duas | A `auth-token` não alcançaria o RDS privado. Só funcionaria tornando o banco público — inaceitável |
| Tornar o RDS público e manter as duas fora | Simples | Expõe o banco à internet. Descartado |

## Decisão

- **`auth-token`**: dentro da VPC default, nas subnets retornadas pelo `data "aws_subnets"`, com um
  security group próprio (`${prefixo}-lambda`) que libera **apenas saída**. A entrada é
  responsabilidade do security group do RDS, que já libera 5432 para o CIDR da VPC.
- **`authorizer`**: sem `vpc_config`, rodando fora da VPC.

## Justificativa

1. **O cold start do `authorizer` é o custo mais sensível do sistema.** Ele roda antes de cada
   requisição protegida não cacheada; uma ENI ali seria latência paga por toda a API.
2. **Security group só de egress é suficiente.** Nada precisa iniciar conexão *para* a function; ela
   é invocada pelo API Gateway, não por rede.
3. **A ausência de NAT na subnet é o que força a decisão do ADR-0005**: dentro da VPC e sem NAT, a
   `auth-token` não alcança serviços públicos da AWS, o que descarta Secrets Manager.

## Consequências

- **Positivas**: o banco permanece privado; o caminho quente (validação de token) não paga cold
  start de ENI; a superfície de rede da function de banco é mínima.
- **Negativas / trade-offs**:
  - Duas configurações de rede diferentes no mesmo repositório — quem mexer precisa entender o
    porquê, daí este ADR.
  - A `auth-token` paga cold start de ENI no primeiro acesso após ociosidade. Aceitável: acontece uma
    vez por sessão de cliente, não por requisição.
  - Usar a VPC **default** e todas as suas subnets é uma simplificação do ambiente de Lab. Num
    ambiente real, a function deveria ficar em subnets privadas designadas, não em todas as que
    existirem na conta.
