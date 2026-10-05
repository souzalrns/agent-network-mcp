// F3a (network-agents-setup: ADR-F3-PROVENANCE-RETRIEVE, P-26 = A): o retrieve passa
// para a RPC match_knowledge_v2 SÓ com KNOWLEDGE_RPC_V2=1. Desligada (omissão), o pedido
// e o formato dos hits são exactamente os de antes: o merge não muda produção até o DEV
// correr a migração e ligar a flag.
// Corre com: npm test   (node --test, sem dependências novas)
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { SUPABASE_URL, reset } from "./_fakes.mjs";

process.env.GEMINI_API_KEY = "test-key";
process.env.SUPABASE_URL = SUPABASE_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";

const ROW_OLD = { id: "c1", content: "Nunca ataque activo.", source: "docs/knowledge/security.md", similarity: 0.9 };
const ROW_V2 = {
  ...ROW_OLD,
  agent_id: "security",
  kb: "security",
  locator: "l.3-5",
  content_hash: "abc123",
  uri: "external:politica.pdf",
  final_url: null,
  title: "Política de acesso",
  document_type: "pdf",
  retrieved_at: "2026-10-05T10:00:00+00:00",
  status: "active",
  jurisdiction: "PT",
  effective_from: null,
  effective_until: null,
};

// Regista as chamadas RPC e devolve linhas no formato de cada função.
const rpcCalls = [];
let v2Missing = false;
const baseFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === "string" ? input : input.url;
  const path = url.startsWith(SUPABASE_URL) ? new URL(url).pathname : "";
  if (path === "/rest/v1/rpc/match_knowledge" || path === "/rest/v1/rpc/match_knowledge_v2") {
    rpcCalls.push({ fn: path.split("/").pop(), body: JSON.parse(init.body) });
    if (path.endsWith("_v2") && v2Missing) {
      // o que o PostgREST responde quando a função não existe (migração por correr)
      return new Response(
        JSON.stringify({ code: "PGRST202", message: "Could not find the function public.match_knowledge_v2" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }
    const rows = path.endsWith("_v2") ? [ROW_V2] : [ROW_OLD];
    return new Response(JSON.stringify(rows), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  return baseFetch(input, init);
};

const { retrieveKnowledgeHits, retrieveContextDetailed, sanitizeKnowledgeFilters, knowledgeRpcV2Enabled } =
  await import("../lib/knowledge.js");
const { getClient } = await import("../lib/memory.js");

beforeEach(() => {
  reset();
  rpcCalls.length = 0;
  v2Missing = false;
  delete process.env.KNOWLEDGE_RPC_V2;
});
afterEach(() => {
  delete process.env.KNOWLEDGE_RPC_V2;
});

test("sem a flag: match_knowledge com os 3 argumentos de sempre e hits sem proveniência", async () => {
  assert.equal(knowledgeRpcV2Enabled(), false);
  const hits = await retrieveKnowledgeHits(getClient(), "ataque activo", "security", 4, {
    filters: { status: "revoked", jurisdiction: "PT" }, // aceites, mas sem efeito sem a flag
  });
  assert.ok(rpcCalls.length >= 1);
  for (const call of rpcCalls) {
    assert.equal(call.fn, "match_knowledge");
    assert.deepEqual(Object.keys(call.body).sort(), ["match_agent_id", "match_count", "query_embedding"]);
  }
  assert.deepEqual(hits[0], {
    content: ROW_OLD.content,
    score: 0.9,
    doc_id: "c1",
    citation: { source: ROW_OLD.source, locator: null },
    metadata: null,
  });
});

test("com KNOWLEDGE_RPC_V2=1: match_knowledge_v2 com os filtros saneados", async () => {
  process.env.KNOWLEDGE_RPC_V2 = "1";
  await retrieveKnowledgeHits(getClient(), "ataque activo", "security", 4, {
    filters: { status: "any", jurisdiction: " PT ", foo: "bar", valid_at: "2026-01-01" },
  });
  assert.equal(rpcCalls.length, 2); // o kb e o 'global', com os mesmos filtros
  for (const call of rpcCalls) {
    assert.equal(call.fn, "match_knowledge_v2");
    assert.deepEqual(call.body.filters, {
      status: "any",
      jurisdiction: "PT",
      valid_at: "2026-01-01T00:00:00.000Z",
    });
  }
  assert.deepEqual(
    rpcCalls.map((c) => c.body.match_agent_id),
    ["security", "global"]
  );
});

test("com KNOWLEDGE_RPC_V2=1: hits com proveniência, sem perder nenhum campo antigo", async () => {
  process.env.KNOWLEDGE_RPC_V2 = "1";
  const [hit] = await retrieveKnowledgeHits(getClient(), "ataque activo", "security", 4, {
    alsoGlobal: false,
  });
  assert.equal(hit.content, ROW_V2.content);
  assert.equal(hit.score, 0.9);
  assert.equal(hit.doc_id, "c1");
  assert.deepEqual(hit.citation, {
    source: ROW_V2.source,
    locator: "l.3-5",
    uri: "external:politica.pdf",
    title: "Política de acesso",
  });
  assert.deepEqual(hit.metadata, {
    document_type: "pdf",
    status: "active",
    retrieved_at: "2026-10-05T10:00:00+00:00",
    jurisdiction: "PT",
    effective_from: null,
    effective_until: null,
    content_hash: "abc123",
    final_url: null,
  });
});

test("com KNOWLEDGE_RPC_V2=1: o contexto dos agentes também usa a v2 (revogados ficam de fora)", async () => {
  process.env.KNOWLEDGE_RPC_V2 = "1";
  const out = await retrieveContextDetailed(getClient(), "security", "ataque activo", { alsoGlobal: false });
  assert.equal(out.hitCount, 1);
  assert.equal(rpcCalls[0].fn, "match_knowledge_v2");
  assert.deepEqual(rpcCalls[0].body.filters, {}); // omissão do SQL: status active, em vigor agora
});

test("a flag só liga com '1'", () => {
  for (const value of ["true", "yes", "0", ""]) {
    process.env.KNOWLEDGE_RPC_V2 = value;
    assert.equal(knowledgeRpcV2Enabled(), false, value);
  }
  process.env.KNOWLEDGE_RPC_V2 = "1";
  assert.equal(knowledgeRpcV2Enabled(), true);
});

test("sanitizeKnowledgeFilters: só chaves e valores válidos chegam ao SQL", () => {
  assert.deepEqual(sanitizeKnowledgeFilters(undefined), { filters: {}, ignored: [] });
  assert.deepEqual(sanitizeKnowledgeFilters(["status"]), { filters: {}, ignored: [] });
  const { filters, ignored } = sanitizeKnowledgeFilters({
    status: "apagado", // fora do conjunto
    jurisdiction: "x".repeat(101), // longo demais
    document_type: 42, // não é texto
    valid_at: "ontem", // não é data
    project: "outro", // chave desconhecida
  });
  assert.deepEqual(filters, {});
  assert.deepEqual(ignored.sort(), ["document_type", "jurisdiction", "project", "status", "valid_at"]);
  assert.deepEqual(sanitizeKnowledgeFilters({ status: "superseded", document_type: "pdf" }).filters, {
    status: "superseded",
    document_type: "pdf",
  });
});

test("flag ligada antes da migração: avisa e cai para a match_knowledge (RAG não fica vazio)", async () => {
  process.env.KNOWLEDGE_RPC_V2 = "1";
  v2Missing = true;
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (msg) => warnings.push(String(msg));
  try {
    const hits = await retrieveKnowledgeHits(getClient(), "ataque activo", "security", 4, {
      alsoGlobal: false,
    });
    assert.equal(hits.length, 1);
    assert.equal(hits[0].citation.source, ROW_OLD.source);
    assert.equal(hits[0].citation.locator, null); // linha antiga: sem proveniência
    assert.deepEqual(
      rpcCalls.map((c) => c.fn),
      ["match_knowledge_v2", "match_knowledge"]
    );
    assert.ok(warnings.some((w) => w.includes("f3_provenance_retrieve.sql")));
  } finally {
    console.warn = originalWarn;
  }
});
