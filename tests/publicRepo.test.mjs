// GOV-PRIV-1: o repo público não versiona conteúdo de terceiros (transcrições).
// As transcrições vivem na tabela public.transcripts do Supabase (transcribe.yml).
// Política: network-agents-setup docs/governance/PRIVACY-POLICY.md §2.
// Corre com: npm test   (node --test, sem dependências novas)
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";

const tracked = () => {
  if (!existsSync(".git")) return null; // sem checkout git (ex.: tarball): nada a verificar
  return execFileSync("git", ["ls-files"], { encoding: "utf8" }).split("\n").filter(Boolean);
};

test("nenhuma transcrição versionada no git", (t) => {
  const files = tracked();
  if (files === null) return t.skip("sem .git");
  const leaked = files.filter((f) => f.startsWith("transcripts/"));
  assert.deepEqual(leaked, [], `conteúdo de terceiros versionado: ${leaked.join(", ")}`);
});

test("a pasta transcripts/ está no .gitignore", () => {
  const rules = readFileSync(".gitignore", "utf8").split("\n").map((l) => l.trim());
  assert.ok(rules.includes("/transcripts/"), "falta /transcripts/ no .gitignore");
});
