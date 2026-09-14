terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Configuração parcial: o nome do bucket carrega o id da conta e chega por -backend-config na
  # pipeline. State local impediria o CI de aplicar.
  backend "s3" {}
}
