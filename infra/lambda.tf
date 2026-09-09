# Grupo de segurança da function dentro da VPC.
#
# Só saída: quem precisa autorizar a entrada é o grupo do RDS, que já libera 5432 para o CIDR
# inteiro da VPC default.
resource "aws_security_group" "lambda" {
  name        = "${local.prefixo}-lambda"
  description = "Saida da Lambda de autenticacao para o RDS"
  vpc_id      = data.aws_vpc.default.id

  egress {
    description = "Saida liberada"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${local.prefixo}-lambda" }
}

# Emissão do token. Fica na VPC porque precisa alcançar o RDS, que não é público.
resource "aws_lambda_function" "auth_token" {
  function_name = "${local.prefixo}-auth-token"
  role          = data.aws_iam_role.lab.arn
  handler       = "token.handler"
  runtime       = "nodejs22.x"
  architectures = ["x86_64"]
  timeout       = 10
  memory_size   = 512

  filename         = local.pacote
  source_code_hash = filebase64sha256(local.pacote)

  # Baixo de propósito: o db.t3.micro tem poucas conexões, e cada execução simultânea abre a sua.
  reserved_concurrent_executions = var.reserved_concurrency

  vpc_config {
    subnet_ids         = data.aws_subnets.default.ids
    security_group_ids = [aws_security_group.lambda.id]
  }

  environment {
    variables = {
      DB_HOST                 = data.aws_db_instance.postgres.address
      DB_PORT                 = tostring(data.aws_db_instance.postgres.port)
      DB_NAME                 = var.db_name
      DB_USER                 = var.db_username
      DB_PASSWORD             = var.db_password
      DB_SSL                  = "true"
      SECURITY_JWT_SECRET     = var.jwt_secret
      SECURITY_JWT_EXPIRATION = tostring(var.jwt_expiration_ms)
    }
  }

  depends_on = [aws_cloudwatch_log_group.auth_token]
}

# Authorizer. Fora da VPC de propósito: não toca no banco, e a ENI da VPC somaria cold start a
# toda requisição protegida.
resource "aws_lambda_function" "authorizer" {
  function_name = "${local.prefixo}-authorizer"
  role          = data.aws_iam_role.lab.arn
  handler       = "authorizer.handler"
  runtime       = "nodejs22.x"
  architectures = ["x86_64"]
  timeout       = 5
  memory_size   = 256

  filename         = local.pacote
  source_code_hash = filebase64sha256(local.pacote)

  environment {
    variables = {
      SECURITY_JWT_SECRET = var.jwt_secret
    }
  }

  depends_on = [aws_cloudwatch_log_group.authorizer]
}

resource "aws_lambda_permission" "auth_token" {
  statement_id  = "AllowInvokeFromApiGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.auth_token.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.oficina.execution_arn}/*/*"
}

resource "aws_lambda_permission" "authorizer" {
  statement_id  = "AllowInvokeFromApiGatewayAuthorizer"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.authorizer.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.oficina.execution_arn}/authorizers/*"
}
