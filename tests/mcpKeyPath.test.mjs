// F0.6: a chave no caminho só é extraída, nunca validada aqui (isso é do withAuth).
import { test } from "node:test";
import assert from "node:assert/strict";
import { chaveDoCaminho } from "../lib/mcpKeyPath.js";

const CHAVE = "a".repeat(32);

test("extrai a chave de /api/mcp/k/<chave>", () => {
  assert.equal(chaveDoCaminho(`/api/mcp/k/${CHAVE}`), CHAVE);
  assert.equal(chaveDoCaminho(`/api/mcp/k/${CHAVE}/`), CHAVE);
  assert.equal(chaveDoCaminho(`/api/mcp/k/${encodeURIComponent("abc+/=def0123456789")}`), "abc+/=def0123456789");
});

test("recusa caminhos que não são a forma exata", () => {
  for (const p of [
    "/api/mcp",
    "/api/mcp/k/",
    `/api/mcp/x/${CHAVE}`,
    `/api/mcp/k/${CHAVE}/extra`,
    "/api/mcp/k/curta",
    `/api/mcp/k/${"b".repeat(600)}`,
    "/api/mcp/k/%E0%A4%A",
    `/api/mcp/k/${encodeURIComponent("com espaço 0123456789")}`,
    null,
  ]) {
    assert.equal(chaveDoCaminho(p), null, String(p));
  }
});
