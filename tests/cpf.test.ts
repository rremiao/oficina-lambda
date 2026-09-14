import { describe, expect, it } from "vitest";

import { cpfEhValido, normalizarCpf } from "../src/domain/cpf.js";

describe("normalizarCpf", () => {
  const casos: Array<[string, string | null | undefined, string]> = [
    ["remove pontuacao e hifen", "529.982.247-25", "52998224725"],
    ["remove espacos", " 529 982 247 25 ", "52998224725"],
    ["mantem o valor ja normalizado", "52998224725", "52998224725"],
    ["devolve vazio para string vazia", "", ""],
    ["devolve vazio para null", null, ""],
    ["devolve vazio para undefined", undefined, ""],
    ["descarta letras", "abc529982247def25", "52998224725"],
  ];

  it.each(casos)("%s", (_nome, entrada, esperado) => {
    expect(normalizarCpf(entrada)).toBe(esperado);
  });
});

describe("cpfEhValido", () => {
  const validos: Array<[string, string]> = [
    ["sem mascara", "52998224725"],
    ["com mascara", "529.982.247-25"],
    ["outro CPF valido", "98765432100"],
    ["CPF valido cujo primeiro digito verificador e zero", "11144477735"],
  ];

  it.each(validos)("aceita %s", (_nome, cpf) => {
    expect(cpfEhValido(cpf)).toBe(true);
  });

  const invalidos: Array<[string, string | null | undefined]> = [
    ["string vazia", ""],
    ["null", null],
    ["undefined", undefined],
    ["so pontuacao", "...-"],
    ["digitos de menos", "5299822472"],
    ["digitos de mais", "529982247251"],
    ["primeiro digito verificador errado", "52998224735"],
    ["segundo digito verificador errado", "52998224724"],
    ["todos os digitos iguais", "11111111111"],
    ["todos os digitos iguais com mascara", "111.111.111-11"],
    ["zeros", "00000000000"],
    ["sequencia conhecida invalida", "12345678901"],
  ];

  it.each(invalidos)("recusa %s", (_nome, cpf) => {
    expect(cpfEhValido(cpf)).toBe(false);
  });
});
