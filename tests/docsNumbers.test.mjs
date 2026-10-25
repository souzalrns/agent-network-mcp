// H-01: os números da documentação vêm do código, não da memória de quem escreveu.
// Se este teste falhar, actualiza o README e corre `node scripts/document-agents.js`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AGENTS } from "../lib/agents.js";

const total = Object.keys(AGENTS).length;

test("o README diz o número real de agentes", () => {
  const readme = readFileSync("README.md", "utf8");
  const claims = [...readme.matchAll(/(\d+) agentes especializados/g)].map((m) => Number(m[1]));
  assert.ok(claims.length > 0, "o README deixou de dizer quantos agentes há");
  assert.deepEqual([...new Set(claims)], [total]);
});

test("o catálogo gerado está actualizado", () => {
  const doc = readFileSync("docs/generated/AGENTS.md", "utf8");
  assert.match(doc, new RegExp(`Total: \\*\\*${total}\\*\\* agentes`));
});
