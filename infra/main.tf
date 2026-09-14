data "aws_caller_identity" "atual" {}

# A role já existe: o Learner Lab não permite criar roles.
data "aws_iam_role" "lab" {
  name = var.lab_role_name
}

data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

# Lê o RDS provisionado pelo repositório oficina-database. Ler em vez de declarar evita dependência
# cruzada de state entre os dois repositórios.
data "aws_db_instance" "postgres" {
  db_instance_identifier = var.db_identifier
}

locals {
  prefixo = "${var.project_name}-${var.ambiente}"

  tags_padrao = {
    Project     = var.project_name
    Environment = var.ambiente
    ManagedBy   = "terraform"
    Component   = "auth-lambda"
  }

  pacote = "${path.module}/../function.zip"

  # Instrumentação New Relic é opcional: enquanto newrelic_layer_arn estiver vazio (conta ainda não
  # provisionada), as functions sobem sem a layer e sem o wrapper, exatamente como hoje.
  newrelic_habilitado = var.newrelic_layer_arn != ""

  newrelic_layers = local.newrelic_habilitado ? [var.newrelic_layer_arn] : []

  newrelic_env_comum = local.newrelic_habilitado ? {
    NEW_RELIC_ACCOUNT_ID               = var.newrelic_account_id
    NEW_RELIC_LICENSE_KEY              = var.newrelic_license_key
    NEW_RELIC_LAMBDA_EXTENSION_ENABLED = "true"
  } : {}

  # Rotas que o Gateway entrega ao backend sem exigir token. O contexto da API é /oficina/v1.
  #
  # `POST /oficina/v1/auth/login` fica aberta pelo mesmo motivo de `POST /auth/token`: é a troca de
  # credencial por token do operador, e não há token para o authorizer validar antes dela. O
  # cadastro de usuários (`/oficina/v1/usuarios`) continua sob o authorizer.
  rotas_abertas = {
    "POST /oficina/v1/auth/login"         = "http://${var.backend_lb_dns}/oficina/v1/auth/login"
    "ANY /oficina/v1/public/{proxy+}"     = "http://${var.backend_lb_dns}/oficina/v1/public/{proxy}"
    "GET /oficina/v1/swagger-ui.html"     = "http://${var.backend_lb_dns}/oficina/v1/swagger-ui.html"
    "GET /oficina/v1/swagger-ui/{proxy+}" = "http://${var.backend_lb_dns}/oficina/v1/swagger-ui/{proxy}"
    "GET /oficina/v1/api-docs"            = "http://${var.backend_lb_dns}/oficina/v1/api-docs"
    "GET /oficina/v1/api-docs/{proxy+}"   = "http://${var.backend_lb_dns}/oficina/v1/api-docs/{proxy}"
  }
}
