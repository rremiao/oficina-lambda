output "api_endpoint" {
  description = "URL base do API Gateway. Vira o gatewayUrl da collection do Postman."
  value       = aws_apigatewayv2_stage.default.invoke_url
}

output "rota_do_token" {
  description = "Endereco completo da emissao de token por CPF."
  value       = "${aws_apigatewayv2_stage.default.invoke_url}auth/token"
}

output "funcao_auth_token" {
  description = "Nome da function de emissao do token."
  value       = aws_lambda_function.auth_token.function_name
}

output "funcao_authorizer" {
  description = "Nome da function do authorizer."
  value       = aws_lambda_function.authorizer.function_name
}

output "conta" {
  description = "Conta AWS onde o componente foi aplicado."
  value       = data.aws_caller_identity.atual.account_id
}
