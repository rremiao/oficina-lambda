/**
 * Empacota os handlers para a Lambda.
 *
 * Cada arquivo em `src/handlers/` vira um bundle independente em `dist/`, e o zip resultante é o
 * artefato que o Terraform publica. O bundle carrega as dependências junto porque a Lambda roda
 * sem `node_modules`.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

import { build } from "esbuild";

const RAIZ = import.meta.dirname;
const ORIGEM = join(RAIZ, "src", "handlers");
const DESTINO = join(RAIZ, "dist");
const PACOTE = join(RAIZ, "function.zip");

function listarHandlers() {
  if (!existsSync(ORIGEM)) {
    return [];
  }

  return readdirSync(ORIGEM)
    .filter((arquivo) => arquivo.endsWith(".ts"))
    .map((arquivo) => join(ORIGEM, arquivo));
}

async function main() {
  const handlers = listarHandlers();

  if (handlers.length === 0) {
    // Acontece enquanto os handlers não existem. Não é erro: o domínio e os testes já valem por si.
    console.warn("Nenhum handler em src/handlers/. Nada a empacotar.");
    return;
  }

  rmSync(DESTINO, { recursive: true, force: true });
  rmSync(PACOTE, { force: true });
  mkdirSync(DESTINO, { recursive: true });

  await build({
    entryPoints: handlers,
    outdir: DESTINO,
    bundle: true,
    minify: true,
    sourcemap: false,
    platform: "node",
    target: "node22",
    // CommonJS de propósito: `pg` é CJS e, empacotado como ESM, quebra em tempo de execução com
    // "Dynamic require of \"events\" is not supported".
    format: "cjs",
    // Extensão .cjs, e não .js, porque o package.json declara "type": "module": sem isso o Node
    // lê o bundle como ESM e estoura com "module is not defined in ES module scope".
    outExtension: { ".js": ".cjs" },
    // O SDK da AWS já vem no runtime; embutir só aumentaria o zip e o cold start.
    external: ["@aws-sdk/*"],
  });

  execFileSync("zip", ["-j", "-q", PACOTE, ...readdirSync(DESTINO).map((a) => join(DESTINO, a))]);

  console.log(`function.zip gerado com ${handlers.length} handler(s).`);
}

await main();
