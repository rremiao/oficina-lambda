ambiente       = "hml"
backend_lb_dns = "af30bd89cf5af4a239be6a1d189b7f8e-1633151984.us-east-1.elb.amazonaws.com"
db_username    = "oficina_user"

# Fase 4: a tabela cliente agora fica no banco do OS Service (ADR-0005 do oficina-database). O banco
# "oficina" do monólito não existe mais no RDS.
db_name = "os_service"

# DNS do LoadBalancer do execution-service. Preencher depois de aplicar os manifests
# do repositório execution-service:
#   kubectl get svc execution-service-lb -n oficina
# Vazio mantém a rota /execution/v1 desligada.
execution_lb_dns = ""

# DNS do LoadBalancer do billing-service (kubectl get svc billing-service -n oficina).
# Vazio mantém as rotas /billing/v1 desligadas.
billing_lb_dns = ""

# New Relic (observabilidade) — opcional. Deixe newrelic_layer_arn vazio para subir sem
# instrumentação (comportamento atual). newrelic_license_key chega via TF_VAR_newrelic_license_key,
# nunca neste arquivo.
newrelic_account_id = "8510026"
newrelic_layer_arn  = ""
