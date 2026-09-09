# Criados aqui, e não pela primeira invocação, para que a retenção valha desde o começo.
resource "aws_cloudwatch_log_group" "auth_token" {
  name              = "/aws/lambda/${local.prefixo}-auth-token"
  retention_in_days = var.log_retention_days
}

resource "aws_cloudwatch_log_group" "authorizer" {
  name              = "/aws/lambda/${local.prefixo}-authorizer"
  retention_in_days = var.log_retention_days
}

resource "aws_cloudwatch_log_group" "gateway" {
  name              = "/aws/apigateway/${local.prefixo}"
  retention_in_days = var.log_retention_days
}

locals {
  # Lista vazia quando não há tópico: o alarme continua existindo e visível no console, só não
  # notifica ninguém. O Learner Lab nem sempre permite criar SNS.
  acoes_de_alarme = var.alarme_sns_topic_arn == "" ? [] : [var.alarme_sns_topic_arn]

  funcoes_monitoradas = {
    auth_token = {
      nome       = aws_lambda_function.auth_token.function_name
      limite_p95 = var.limite_p95_token_ms
      descricao  = "emissao do token"
    }
    authorizer = {
      nome       = aws_lambda_function.authorizer.function_name
      limite_p95 = var.limite_p95_authorizer_ms
      descricao  = "authorizer"
    }
  }
}

# Falha de execução da função, que é diferente de recusa de negócio: um 404 de cliente inexistente
# é resposta esperada e não conta aqui.
resource "aws_cloudwatch_metric_alarm" "erros" {
  for_each = local.funcoes_monitoradas

  alarm_name          = "${each.value.nome}-erros"
  alarm_description   = "Erros de execucao na ${each.value.descricao}"
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = { FunctionName = each.value.nome }

  alarm_actions = local.acoes_de_alarme
  ok_actions    = local.acoes_de_alarme
}

resource "aws_cloudwatch_metric_alarm" "duracao" {
  for_each = local.funcoes_monitoradas

  alarm_name          = "${each.value.nome}-duracao-p95"
  alarm_description   = "Duracao p95 acima do tolerado na ${each.value.descricao}"
  namespace           = "AWS/Lambda"
  metric_name         = "Duration"
  extended_statistic  = "p95"
  period              = 300
  evaluation_periods  = 2
  threshold           = each.value.limite_p95
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = { FunctionName = each.value.nome }

  alarm_actions = local.acoes_de_alarme
  ok_actions    = local.acoes_de_alarme
}

# Estrangulamento por concorrência reservada: o sintoma seria cliente sem conseguir token, sem
# nenhum erro na função.
resource "aws_cloudwatch_metric_alarm" "throttles" {
  alarm_name          = "${aws_lambda_function.auth_token.function_name}-throttles"
  alarm_description   = "Invocacoes estranguladas na emissao do token"
  namespace           = "AWS/Lambda"
  metric_name         = "Throttles"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = { FunctionName = aws_lambda_function.auth_token.function_name }

  alarm_actions = local.acoes_de_alarme
  ok_actions    = local.acoes_de_alarme
}

resource "aws_cloudwatch_metric_alarm" "gateway_5xx" {
  alarm_name          = "${local.prefixo}-api-5xx"
  alarm_description   = "Respostas 5xx no API Gateway da oficina"
  namespace           = "AWS/ApiGateway"
  metric_name         = "5xx"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 5
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = { ApiId = aws_apigatewayv2_api.oficina.id }

  alarm_actions = local.acoes_de_alarme
  ok_actions    = local.acoes_de_alarme
}
