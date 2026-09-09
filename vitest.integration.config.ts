import { defineConfig } from "vitest/config";

// Só os testes de integração (tests/integration/*.integration.ts). O `npm test` continua rodando
// apenas os testes unitários, pelo glob padrão do Vitest, que não casa com `*.integration.ts`.
export default defineConfig({
  test: {
    include: ["tests/integration/**/*.integration.ts"],
    // Uma conexão de banco por processo; sem paralelismo entre arquivos.
    fileParallelism: false,
    testTimeout: 15_000,
  },
});
