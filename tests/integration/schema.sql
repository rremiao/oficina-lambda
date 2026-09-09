-- Esquema mínimo para os testes de integração da função `auth-token`.
--
-- Espelha, do repositório `oficina`:
--   src/main/resources/db/migration/V1__create_table_cliente.sql
--   src/main/resources/db/migration/V10__index_cpf_cnpj_normalizado.sql
-- Só a tabela `cliente` importa aqui — é a única que a função consulta.

CREATE TABLE cliente
(
    id               BIGSERIAL PRIMARY KEY,
    nome             VARCHAR(150) NOT NULL,
    cpf_cnpj         VARCHAR(20)  NOT NULL UNIQUE,
    telefone         VARCHAR(20),
    email            VARCHAR(150),
    cep              VARCHAR(8)   NOT NULL,
    logradouro       VARCHAR(150) NOT NULL,
    bairro           VARCHAR(100) NOT NULL,
    cidade           VARCHAR(100) NOT NULL,
    uf               VARCHAR(2)   NOT NULL,
    data_nascimento  DATE         NOT NULL,
    ativo            BOOLEAN      NOT NULL DEFAULT TRUE,
    data_criacao     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_atualizacao TIMESTAMP NULL
);

CREATE INDEX idx_cliente_cpf_cnpj_digitos
    ON cliente ((regexp_replace(cpf_cnpj, '\D', '', 'g')));

-- Cliente ativo, cadastrado COM máscara: prova que a normalização nos dois lados da consulta
-- (regexp_replace no banco, normalizarCpf na função) encontra o registro.
INSERT INTO cliente (nome, cpf_cnpj, cep, logradouro, bairro, cidade, uf, data_nascimento, ativo)
VALUES ('Cliente Ativo Com Mascara', '529.982.247-25', '01001000', 'Praca da Se', 'Se',
        'Sao Paulo', 'SP', '1990-01-01', TRUE);

-- Cliente inativo, cadastrado SEM máscara: caminho do 403.
INSERT INTO cliente (nome, cpf_cnpj, cep, logradouro, bairro, cidade, uf, data_nascimento, ativo)
VALUES ('Cliente Inativo Sem Mascara', '11144477735', '20040002', 'Av Rio Branco', 'Centro',
        'Rio de Janeiro', 'RJ', '1985-05-05', FALSE);
