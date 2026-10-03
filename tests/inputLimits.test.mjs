// S-001 (checklist #14): todas as strings de input das tools MCP têm tecto de tamanho.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { INPUT_LIMITS } from "../lib/inputLimits.js";

const route = readFileSync(new URL("../app/api/mcp/route.js", import.meta.url), "utf8");

test("cada .string() do route.js é seguido de .max(INPUT_LIMITS.<campo>)", () => {
  const sem = [];
  const re = /\.string\(\)/g;
  let m;
  while ((m = re.exec(route))) {
    const tail = route.slice(m.index, m.index + 80);
    if (!/^\.string\(\)\s*\.max\(INPUT_LIMITS\.\w+\)/.test(tail)) {
      sem.push(route.slice(0, m.index).split("\n").length);
    }
  }
  assert.deepEqual(sem, [], `strings sem .max() nas linhas ${sem.join(", ")}`);
});

test("cada INPUT_LIMITS usado no route.js existe e é inteiro > 0", () => {
  const usados = [...route.matchAll(/INPUT_LIMITS\.(\w+)/g)].map((x) => x[1]);
  assert.ok(usados.length >= 16);
  for (const k of usados) {
    assert.ok(Number.isInteger(INPUT_LIMITS[k]) && INPUT_LIMITS[k] > 0, `INPUT_LIMITS.${k}`);
  }
});

test("o maior ficheiro real de ingestion/ cabe no tecto do text", () => {
  const maior = readFileSync(new URL("../ingestion/arquitetura-agentes-planejamento-rede-docs.md", import.meta.url), "utf8");
  assert.ok(maior.length < INPUT_LIMITS.text);
});

test("um z.string().max() com o tecto recusa texto maior (o que o SDK faz no safeParse)", () => {
  const schema = z.object({ query: z.string().max(INPUT_LIMITS.query) }).strict();
  assert.equal(schema.safeParse({ query: "x".repeat(INPUT_LIMITS.query) }).success, true);
  assert.equal(schema.safeParse({ query: "x".repeat(INPUT_LIMITS.query + 1) }).success, false);
});
