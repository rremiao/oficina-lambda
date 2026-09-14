# RFC-0001 — Autenticação de clientes por CPF com JWT HS256 compartilhado

## Status

Aceito

## Contexto

O Tech Challenge Fase 3 pede que rotas sensíveis da aplicação sejam protegidas por autenticação via
CPF, e que uma function serverless valide o CPF, consulte a existência e o status do cliente na base
e devolva um JWT válido para consumo das APIs protegidas.

A aplicação (`oficina`) já tinha, desde fases anteriores, autenticação de **operador** por
e-mail/senha, com JWT HS256 assinado e validado por ela mesma (`security.jwt.secret`). O cliente
final, porém, nunca teve credencial: ele não tem senha na base, apenas um documento (`cpf_cnpj` na
tabela `cliente`).

A pergunta desta RFC é: como emitir um token para o cliente sem criar um segundo sistema de
identidade, e sem quebrar o fluxo de operador que já existia?

## Alternativas consideradas

| Opção | Prós | Contras |
|---|---|---|
| **JWT HS256 com o mesmo segredo da API** | A API já sabe validar HS256; nenhuma mudança em `SecurityConfig`; a function só precisa assinar com o mesmo segredo | O segredo passa a existir em três lugares (API, `auth-token`, `authorizer`); rotação exige coordenação |
| JWT RS256 (par de chaves) | A function seria a única com a chave privada; os validadores só precisariam da pública | Exigiria gerar, distribuir e rotacionar chaves, e alterar a API para validar por chave pública — custo desproporcional ao prazo da fase |
| Amazon Cognito | Serviço gerenciado, com fluxo de refresh e revogação prontos | Desenhado para credencial com segredo; identificação por CPF sem senha não é o caso de uso natural. Exigiria migrar também os operadores e reescrever o `SecurityConfig` para JWKS |
| Sessão opaca em banco/cache | Permite revogação imediata | Introduz um armazenamento novo (Redis/DynamoDB) e uma consulta a cada requisição — exatamente o que o token autocontido evita |

## Decisão

Emitir um **JWT HS256 assinado com o mesmo segredo da API Spring**, pela function `auth-token`,
exposta em `POST /auth/token` no API Gateway.

### Contrato

O corpo aceita o CPF com ou sem máscara. A function normaliza (`\D` removido), valida tamanho,
sequência repetida e dígitos verificadores — espelhando o `ValidadorCPF` da aplicação — e só então
consulta a base.

| Código | Situação |
|---|---|
| `200` | CPF válido, cliente existe e está ativo — devolve `{ token, tipo, expiraEm, cliente }` |
| `400` | CPF ausente, malformado ou com dígito verificador inválido |
| `404` | CPF válido, mas sem cliente correspondente |
| `403` | Cliente existe com `ativo = false` |
| `503` | Banco indisponível ou timeout de conexão |

### Claims

| Claim | Conteúdo |
|---|---|
| `sub` | CPF normalizado (só dígitos) |
| `tipo` | `"CLIENTE"` — é por ela que o filtro da API decide o caminho de autenticação |
| `clienteId` | `id` numérico do cliente. Precisa ser número: o filtro lê a claim como `Number` |
| `nome` | Nome do cliente, evita uma ida ao banco só para exibição |
| `role` | `"CLIENTE"` |
| `iat` / `exp` | Emissão e expiração (padrão 7.200.000 ms, o mesmo `security.jwt.expiration` da API) |

## Justificativa

1. **A API não precisou de um segundo mecanismo de validação.** Ela já valida HS256 com esse
   segredo; a única mudança do lado dela foi ramificar pela claim `tipo` — o caminho do operador
   continuou intacto e coberto pelos testes que já existiam.
2. **A consulta é feita direto no RDS, não pela API.** A rota de clientes da aplicação é protegida;
   usá-la criaria uma dependência circular de autenticação (precisaria de um token para emitir um
   token). O `clienteRepository` compara o documento normalizado dos dois lados:
   `WHERE regexp_replace(cpf_cnpj, '\D', '', 'g') = $1`, porque a coluna guarda CPF ou CNPJ em
   formato livre.
3. **A validação de CPF é duplicada de propósito** entre a function e a aplicação. As duas
   implementações precisam concordar: um CPF aceito aqui e recusado lá deixaria o cliente com um
   token que a API nunca honra.
4. **O token é autocontido.** Sem consulta a sessão, o `authorizer` decide em milissegundos e pode
   cachear o resultado.

## Consequências

- **Positivas**: o requisito de autenticação por CPF é atendido sem introduzir um provedor de
  identidade novo; a superfície de mudança na aplicação ficou pequena e aditiva.
- **Negativas / trade-offs**:
  - O mesmo segredo simétrico circula em três componentes. Vazamento em qualquer um permite forjar
    tokens. Migrar para RS256 é a evolução natural se o projeto seguir.
  - **Não há revogação.** Um token emitido vale até expirar, mesmo que o cliente seja desativado na
    base logo depois. O `exp` curto (2h) limita a janela, mas não a elimina.
  - A migration `V10` do repositório `oficina` (índice funcional sobre o CPF normalizado) passa a
    ser dependência de desempenho desta function: sem ela, cada login é um *seq scan* em `cliente`.
