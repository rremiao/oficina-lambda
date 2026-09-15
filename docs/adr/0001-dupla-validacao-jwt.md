# ADR-0001 — Validar o JWT no Lambda Authorizer e no filtro da API Spring

## Status

Aceito

## Contexto

Com o Lambda Authorizer na borda, toda requisição a uma rota protegida já teve assinatura e
expiração verificadas antes de chegar ao EKS. Cabia decidir se a aplicação Spring ainda precisa
validar o mesmo token, ou se pode confiar na decisão do Gateway.

O fato decisivo é topológico: o Service da API no EKS é do tipo **LoadBalancer e é público**. Quem
souber o DNS do LoadBalancer fala com a aplicação sem passar pelo Gateway. O authorizer, sozinho,
não é uma fronteira de rede — é uma barreira de borda.

## Alternativas consideradas

| Opção | Prós | Contras |
|---|---|---|
| **Validar nos dois pontos** | Defesa em profundidade; erro de configuração num lado não vira brecha | Verificação de assinatura acontece duas vezes por requisição |
| Confiar só no authorizer, lendo as claims que ele repassa no `context` | Menos CPU na aplicação | Com o LoadBalancer público, qualquer requisição que chegue por fora do Gateway seria aceita sem validação nenhuma |
| Confiar só na aplicação, sem authorizer | Menos peças | Requisição com token inválido consumiria CPU do cluster e conexão de banco antes de ser recusada |
| LoadBalancer interno + VPC Link | Fecharia a rede de verdade, tornando a dupla validação opcional | Mudança de topologia mais cara, e o Learner Lab encarece o VPC Link. Fora do escopo da fase |

## Decisão

O token é validado **duas vezes**: no `authorizer` (assinatura e expiração, sem tocar no banco) e de
novo no `JwtAuthenticationFilter` da aplicação, que ramifica pela claim `tipo` e monta um principal
`ClienteAutenticado` com authority fixa `ROLE_CLIENTE`.

Como consequência direta, o `context` devolvido pelo authorizer (`tipo`, `clienteId`,
`correlationId`) é **material de log, não fonte de autorização**. O único valor efetivamente
consumido adiante é o `correlationId`, que o Gateway injeta no cabeçalho para o backend.

## Justificativa

1. **O backend é alcançável por fora.** Enquanto o Service for público, confiar só na borda
   significa não ter proteção nenhuma para quem descobrir o DNS.
2. **O cache do authorizer não enfraquece a segurança.** O resultado fica em cache por 300s, mas a
   aplicação revalida assinatura e expiração a cada requisição — um token que expirou dentro da
   janela de cache é aceito pelo Gateway e recusado pela aplicação.
3. **A authority é fixada pela aplicação, não pela claim.** Mesmo que alguém forje um `role` diferente
   dentro de um token válido, o filtro concede sempre `ROLE_CLIENTE` para `tipo = CLIENTE`.

## Consequências

- **Positivas**: nenhum componente é ponto único de verdade; um erro de configuração no Gateway (uma
  rota aberta por engano) não vira brecha sozinho.
- **Negativas / trade-offs**:
  - Custo de CPU duplicado por requisição. Irrelevante no volume do projeto, mas é custo real.
  - Os dois validadores precisam concordar em segredo e em leitura de claims. Uma versão do
    `oficina` fora de sincronia com este repositório quebra um dos lados **em silêncio** — o token é
    emitido normalmente e só a rota protegida acusa, com `403`.
  - Exige que a aplicação conheça a claim `tipo`. Sem o suporte do lado Java, o token de cliente é
    tratado como token de operador e a autenticação falha.
