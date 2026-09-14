ambiente       = "hml"
backend_lb_dns = "aa50cac0170dd4ba390472ea77e2e7ac-299863900.us-east-1.elb.amazonaws.com"
db_username    = "oficina_user"

# New Relic (observabilidade) — opcional. Deixe newrelic_layer_arn vazio para subir sem
# instrumentação (comportamento atual). newrelic_license_key chega via TF_VAR_newrelic_license_key,
# nunca neste arquivo.
newrelic_account_id = "8510026"
newrelic_layer_arn  = "arn:aws:lambda:us-east-1:451483290750:layer:NewRelicNodeJS22X:105"
