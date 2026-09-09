variable "aws_region" {
  description = "Região AWS usada no Learner Lab."
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Nome base dos recursos."
  type        = string
  default     = "oficina"
}

variable "ambiente" {
  description = "Sufixo do ambiente, usado no nome dos recursos."
  type        = string

  validation {
    condition     = contains(["hml", "prd"], var.ambiente)
    error_message = "Ambiente deve ser hml ou prd."
  }
}

variable "lab_role_name" {
  description = "Role padrão do AWS Academy/Learner Lab. O lab não permite criar roles."
  type        = string
  default     = "LabRole"
}

variable "db_identifier" {
  description = "Identificador da instância RDS provisionada pelo repositório oficina-database."
  type        = string
  default     = "oficina-db"
}

variable "db_name" {
  description = "Nome do banco PostgreSQL."
  type        = string
  default     = "oficina"
}

variable "db_username" {
  description = "Usuário do banco."
  type        = string
  default     = "postgres"
}

variable "db_password" {
  description = "Senha do banco. Chega por TF_VAR_db_password, a partir do secret do GitHub."
  type        = string
  sensitive   = true
}

variable "jwt_secret" {
  description = "Segredo HS256. Precisa ser idêntico ao security.jwt.secret da API Spring."
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.jwt_secret) >= 32
    error_message = "O segredo HS256 precisa de pelo menos 32 caracteres."
  }
}

variable "jwt_expiration_ms" {
  description = "Validade do token em milissegundos, espelhando security.jwt.expiration."
  type        = number
  default     = 7200000
}

variable "backend_lb_dns" {
  description = "DNS do LoadBalancer do Service da API no cluster EKS."
  type        = string
}

variable "reserved_concurrency" {
  description = "Execuções simultâneas da função de token, limitadas para não esgotar o db.t3.micro."
  type        = number
  default     = 5
}

variable "log_retention_days" {
  description = "Retenção dos logs no CloudWatch."
  type        = number
  default     = 7
}

variable "authorizer_cache_seconds" {
  description = "Cache do resultado do authorizer, por token."
  type        = number
  default     = 300
}

variable "alarme_sns_topic_arn" {
  description = "Tópico SNS que recebe os alarmes. Vazio cria os alarmes sem destino de notificação."
  type        = string
  default     = ""
}

variable "limite_p95_token_ms" {
  description = "Duração p95 tolerada na emissão do token. Acima disso o alarme dispara."
  type        = number
  default     = 3000
}

variable "limite_p95_authorizer_ms" {
  description = "Duração p95 tolerada no authorizer, que roda em toda requisição protegida."
  type        = number
  default     = 1000
}
