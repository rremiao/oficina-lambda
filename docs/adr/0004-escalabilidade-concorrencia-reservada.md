# ADR-0004 — Escalabilidade: concorrência reservada e conexão reaproveitada

## Status

Aceito

## Contexto

A Lambda escala horizontalmente sem limite por padrão. Isso é normalmente uma vantagem, mas aqui
cria um risco: a `auth-token` abre uma conexão PostgreSQL por execução simultânea, e o banco é um
`db.t3.micro`, cujo `max_connections` é da ordem de poucas dezenas — compartilhado com o pool da
própria aplicação no EKS.

Um pico de logins poderia esgotar as conexões do RDS e derrubar não só a autenticação, mas a
aplicação inteira.

## Alternativas consideradas

| Opção | Prós | Contras |
|---|---|---|
| **Concorrência reservada baixa (5) na `auth-token`** | Limita o número de conexões que a function pode abrir; protege o banco e a aplicação | Sob pico, invocações excedentes são estranguladas (`429`) em vez de enfileiradas |
| Sem limite de concorrência | Escala livre | Um pico de login pode esgotar o `max_connections` do `db.t3.micro` e derrubar a API junto |
| RDS Proxy na frente do banco | Resolveria o pooling de verdade | Serviço adicional, com custo e permissões que o Learner Lab não garante |
| Instância de banco maior | Mais conexões disponíveis | Custo, e não resolve o problema — só empurra o limite |

## Decisão

- **`reserved_concurrent_executions = 5`** na `auth-token` (variável `reserved_concurrency`).
- **Sem limite de concorrência no `authorizer`**, que não toca no banco.
- Conexão de banco reaproveitada entre invocações no mesmo contêiner (`obterConexao` mantém o
  cliente fora do handler, aproveitando o *warm start*).
- **Cache de 300s** no resultado do authorizer (`authorizer_result_ttl_in_seconds`), com chave no
  cabeçalho `Authorization`, o que corta a maior parte das invocações repetidas.

## Justificativa

1. **As duas functions têm perfis opostos.** A `auth-token` é chamada uma vez por sessão e fala com
   o banco; o `authorizer` é chamado a cada requisição e não fala com ninguém. Limitar as duas do
   mesmo jeito seria errado nos dois casos.
2. **Estrangular a emissão de token é preferível a derrubar o banco.** Um cliente que recebe erro ao
   pegar token tenta de novo; um RDS sem conexões livres derruba a aplicação inteira.
3. **O alarme de `Throttles` existe por causa desta decisão** (RFC-0004): estrangulamento por
   concorrência reservada é um sintoma que não aparece como erro na function.

## Consequências

- **Positivas**: o banco fica protegido de pico de autenticação; o `authorizer` escala livremente,
  que é onde a escala realmente importa.
- **Negativas / trade-offs**:
  - O limite de 5 é calibrado para o ambiente de demonstração. Em produção precisaria de teste de
    carga e provavelmente de RDS Proxy.
  - Concorrência reservada **subtrai** da concorrência disponível da conta. Numa conta com outras
    funções, isso é uma decisão compartilhada, não local.
  - O cache do authorizer tem efeito de segurança: um token revogado (ou um cliente desativado)
    continua autorizado na borda por até 5 minutos. A revalidação na aplicação (ADR-0001) limita o
    dano, mas não faz o token deixar de ser válido.
