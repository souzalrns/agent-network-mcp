// R-004: o ingestDocument do MCP só pode apagar as suas próprias linhas.
// A knowledge_chunks é partilhada com o T6 do network-agents-setup: as linhas do
// T6 têm project = 'network-agents-setup'; as do MCP têm project NULL
// (network-agents-setup:scripts/rag_schema.sql). Sem o filtro de project, um
// ingest do MCP com a mesma (agent_id, source) apagava as linhas do T6.
// Corre com: npm test   (node --test, sem dependências novas)
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { SUPABASE_URL, reset } from "./_fakes.mjs";

process.env.GEMINI_API_KEY = "test-key";
process.env.SUPABASE_URL = SUPABASE_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";

// Regista os pedidos ao Supabase e delega no fake partilhado.
const calls = [];
const baseFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === "string" ? input : input.url;
  if (url.startsWith(SUPABASE_URL)) calls.push({ method: init.method || "GET", url: new URL(url), body: init.body });
  return baseFetch(input, init);
};

const { ingestDocument } = await import("../lib/knowledge.js");
const { getClient } = await import("../lib/memory.js");

beforeEach(() => {
  reset();
  calls.length = 0;
});

const chunkCalls = (method) =>
  calls.filter((c) => c.method === method && c.url.pathname === "/rest/v1/knowledge_chunks");

test("o replace apaga só as linhas do MCP (project IS NULL), nunca as do T6", async () => {
  const result = await ingestDocument(getClient(), "mesaflow", "docs/menu.md", "texto curto");

  assert.deepEqual(result.errors, []);
  const deletes = chunkCalls("DELETE");
  assert.equal(deletes.length, 1);
  const q = deletes[0].url.searchParams;
  assert.equal(q.get("agent_id"), "eq.mesaflow");
  assert.equal(q.get("source"), "eq.docs/menu.md");
  assert.equal(q.get("project"), "is.null");
});

test("com replace: false não apaga nada", async () => {
  await ingestDocument(getClient(), "mesaflow", "docs/menu.md", "texto curto", { replace: false });
  assert.equal(chunkCalls("DELETE").length, 0);
});

test("as linhas inseridas não levam project (ficam NULL, do MCP)", async () => {
  await ingestDocument(getClient(), "mesaflow", "docs/menu.md", "texto curto");
  const inserts = chunkCalls("POST");
  assert.equal(inserts.length, 1);
  const row = JSON.parse(inserts[0].body);
  assert.equal(row.agent_id, "mesaflow");
  assert.equal(row.source, "docs/menu.md");
  assert.equal("project" in row, false);
});
