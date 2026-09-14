ambiente       = "prd"
backend_lb_dns = "SUBSTITUIR-pelo-dns-do-loadbalancer-de-producao"

# New Relic (observabilidade) — opcional. Deixe newrelic_layer_arn vazio para subir sem
# instrumentação (comportamento atual). newrelic_license_key chega via TF_VAR_newrelic_license_key,
# nunca neste arquivo.
newrelic_account_id = "8510026"
newrelic_layer_arn  = "arn:aws:lambda:us-east-1:451483290750:layer:NewRelicNodeJS22X:105"
