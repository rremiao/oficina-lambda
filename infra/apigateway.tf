resource "aws_apigatewayv2_api" "oficina" {
  name          = "${local.prefixo}-api"
  description   = "Entrada unica da oficina: emissao de token e roteamento para a API no EKS"
  protocol_type = "HTTP"
}

# --- Emissão do token -------------------------------------------------------------------------

resource "aws_apigatewayv2_integration" "auth_token" {
  api_id                 = aws_apigatewayv2_api.oficina.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.auth_token.invoke_arn
  payload_format_version = "2.0"
}

# Rota aberta: é aqui que o cliente troca o CPF pelo token.
resource "aws_apigatewayv2_route" "auth_token" {
  api_id             = aws_apigatewayv2_api.oficina.id
  route_key          = "POST /auth/token"
  target             = "integrations/${aws_apigatewayv2_integration.auth_token.id}"
  authorization_type = "NONE"
}

# --- Authorizer -------------------------------------------------------------------------------

resource "aws_apigatewayv2_authorizer" "jwt" {
  api_id                            = aws_apigatewayv2_api.oficina.id
  name                              = "${local.prefixo}-jwt"
  authorizer_type                   = "REQUEST"
  authorizer_uri                    = aws_lambda_function.authorizer.invoke_arn
  authorizer_payload_format_version = "2.0"
  enable_simple_responses           = true

  # Sem uma identity source o cache não tem chave e o Gateway recusa habilitá-lo.
  identity_sources                 = ["$request.header.Authorization"]
  authorizer_result_ttl_in_seconds = var.authorizer_cache_seconds
}

# --- Rotas abertas do backend -----------------------------------------------------------------

resource "aws_apigatewayv2_integration" "abertas" {
  for_each = local.rotas_abertas

  api_id             = aws_apigatewayv2_api.oficina.id
  integration_type   = "HTTP_PROXY"
  integration_method = "ANY"
  integration_uri    = each.value
}

resource "aws_apigatewayv2_route" "abertas" {
  for_each = local.rotas_abertas

  api_id             = aws_apigatewayv2_api.oficina.id
  route_key          = each.key
  target             = "integrations/${aws_apigatewayv2_integration.abertas[each.key].id}"
  authorization_type = "NONE"
}

# --- Tudo o mais vai protegido para o EKS ------------------------------------------------------

resource "aws_apigatewayv2_integration" "backend" {
  api_id             = aws_apigatewayv2_api.oficina.id
  integration_type   = "HTTP_PROXY"
  integration_method = "ANY"

  # Sem path na URI: na rota $default o Gateway repassa o caminho inteiro da requisição. Usar
  # {proxy} aqui seria erro, porque $default não define essa variável.
  integration_uri = "http://${var.backend_lb_dns}"

  # Fecha a corrente de correlação: o authorizer resolve o identificador, e ele segue para a API no
  # EKS no mesmo cabeçalho que o cliente pode ter enviado. Sem isso a correlação para no Gateway.
  request_parameters = {
    "overwrite:header.x-correlation-id" = "$context.authorizer.correlationId"
  }
}

resource "aws_apigatewayv2_route" "backend" {
  api_id             = aws_apigatewayv2_api.oficina.id
  route_key          = "$default"
  target             = "integrations/${aws_apigatewayv2_integration.backend.id}"
  authorization_type = "CUSTOM"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
}

# --- Stage --------------------------------------------------------------------------------------

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.oficina.id
  name        = "$default"
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.gateway.arn

    # correlationId no log do Gateway é o que amarra a requisição ao log da Lambda e ao da API.
    format = jsonencode({
      requestId     = "$context.requestId"
      correlationId = "$context.authorizer.correlationId"
      ip            = "$context.identity.sourceIp"
      requestTime   = "$context.requestTime"
      routeKey      = "$context.routeKey"
      status        = "$context.status"
      latencia      = "$context.responseLatency"
      integracao    = "$context.integrationErrorMessage"
    })
  }

  default_route_settings {
    throttling_burst_limit = 50
    throttling_rate_limit  = 100
  }
}
