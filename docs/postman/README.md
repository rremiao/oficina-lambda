# Collection Postman

`oficina-lambda.postman_collection.json` cobre o fluxo de autenticação por CPF ponta a ponta:
emissão do token nos quatro cenários de CPF, consumo de rota protegida (com token, sem token e com
token adulterado), rotas abertas e a verificação de correlação de requisições.

## Como usar

1. Importe o arquivo no Postman (**Import → File**).
2. Na aba **Variables** da collection, preencha `gatewayUrl` com o output do Terraform, **sem barra
   no final**:

   ```bash
   cd infra && terraform output -raw api_endpoint | sed 's#/$##'
   ```

3. Confirme que os CPFs de referência foram semeados no RDS (passo de seed do
   [runbook](https://github.com/rremiao/oficina-kubernetes/blob/main/docs/runbook-ambiente-completo.md)).
4. Rode pelo **Collection Runner**, na ordem das pastas.

A primeira requisição guarda `token` e `clienteId` nas variáveis da collection; as demais dependem
disso, então rodar fora de ordem faz as seguintes falharem.

## O que cada pasta comprova

| Pasta | Requisito do enunciado |
| --- | --- |
| 1. Emissão do token | Function serverless valida o CPF, consulta existência e status do cliente, devolve JWT |
| 2. Rota protegida | Rotas sensíveis protegidas por autenticação via CPF, com o API Gateway barrando na borda |
| 3. Rotas abertas | Roteamento do API Gateway, incluindo o login de operador e o OpenAPI |
| 4. Correlação | Logs estruturados com correlação entre requisições |

Os CPFs `529.982.247-25` (ativo, gravado com máscara) e `111.444.777-35` (inativo, gravado sem
máscara) são propositalmente de formatos diferentes: é o que prova que a normalização e o índice
funcional `idx_cliente_cpf_cnpj_digitos` funcionam nos dois casos.
