// F3b (network-agents-setup: P-31 = D, P-32 = B, P-33 = B): com KNOWLEDGE_RPC_V3=1 o
// retrieve usa a match_knowledge_v3 (autoridade, superseded_by e o filtro min_authority).
// Desligada (omissão), nada muda: v2 com KNOWLEDGE_RPC_V2=1, senão a match_knowledge.
// Um plano que EXIGE min_authority nunca recebe fontes sem autoridade verificada.
// Corre com: npm test   (node --test, sem dependências novas)
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { SUPABASE_URL, reset } from "./_fakes.mjs";

process.env.GEMINI_API_KEY = "test-key";
process.env.SUPABASE_URL = SUPABASE_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";

const ROW_OLD = { id: "c1", content: "Prazo de 30 dias.", source: "docs/knowledge/legal/v1.md", similarity: 0.9 };
const ROW_V2 = {
  ...ROW_OLD,
  agent_id: "legal",
  kb: "legal",
  locator: "l.3-5",
  content_hash: "abc123",
  uri: "docs/knowledge/legal/v1.md",
  final_url: null,
  title: null,
  document_type: "md",
  retrieved_at: "2026-10-05T10:00:00+00:00",
  status: "superseded",
  jurisdiction: "PT",
  effective_from: null,
  effective_until: null,
};
const ROW_V3 = { ...ROW_V2, authority: "oficial", superseded_by: "docs/knowledge/legal/v2.md" };
const ROWS = { match_knowledge: [ROW_OLD], match_knowledge_v2: [ROW_V2], match_knowledge_v3: [ROW_V3] };

const rpcCalls = [];
const missing = new Set(); // funções "por criar" (migração por correr)
const baseFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === "string" ? input : input.url;
  const path = url.startsWith(SUPABASE_URL) ? new URL(url).pathname : "";
  const fn = path.startsWith("/rest/v1/rpc/") ? path.split("/").pop() : "";
  if (fn in ROWS) {
    rpcCalls.push({ fn, body: JSON.parse(init.body) });
    if (missing.has(fn)) {
      return new Response(
        JSON.stringify({ code: "PGRST202", message: `Could not find the function public.${fn}` }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response(JSON.stringify(ROWS[fn]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  return baseFetch(input, init);
};

const { retrieveKnowledgeHits, retrieveContextDetailed, sanitizeKnowledgeFilters, knowledgeRpcV3Enabled } =
  await import("../lib/knowledge.js");
const { getClient } = await import("../lib/memory.js");

const warnings = [];
const originalWarn = console.warn;

beforeEach(() => {
  reset();
  rpcCalls.length = 0;
  missing.clear();
  warnings.length = 0;
  console.warn = (msg) => warnings.push(String(msg));
  delete process.env.KNOWLEDGE_RPC_V2;
  delete process.env.KNOWLEDGE_RPC_V3;
});
afterEach(() => {
  console.warn = originalWarn;
  delete process.env.KNOWLEDGE_RPC_V2;
  delete process.env.KNOWLEDGE_RPC_V3;
});

const ONLY_KB = { alsoGlobal: false };

test("com KNOWLEDGE_RPC_V3=1: match_knowledge_v3 com min_authority e hits com autoridade", async () => {
  process.env.KNOWLEDGE_RPC_V3 = "1"; // não precisa da KNOWLEDGE_RPC_V2
  const hits = await retrieveKnowledgeHits(getClient(), "prazo", "legal", 4, {
    filters: { min_authority: " oficial ", status: "any" },
  });
  assert.equal(rpcCalls.length, 2); // o kb e o 'global'
  for (const call of rpcCalls) {
    assert.equal(call.fn, "match_knowledge_v3");
    assert.deepEqual(call.body.filters, { min_authority: "oficial", status: "any" });
  }
  assert.equal(hits[0].metadata.authority, "oficial");
  assert.equal(hits[0].metadata.superseded_by, "docs/knowledge/legal/v2.md");
  assert.equal(hits[0].metadata.status, "superseded");
  assert.equal(hits[0].citation.locator, "l.3-5"); // os campos da v2 continuam lá
  assert.deepEqual(warnings, []);
});

test("sem a v3: os hits da v2 ficam exactamente como antes (sem chaves novas)", async () => {
  process.env.KNOWLEDGE_RPC_V2 = "1";
  const [hit] = await retrieveKnowledgeHits(getClient(), "prazo", "legal", 4, ONLY_KB);
  assert.equal(rpcCalls[0].fn, "match_knowledge_v2");
  assert.ok(!("authority" in hit.metadata) && !("superseded_by" in hit.metadata));
});

test("v3 ligada antes do SQL: avisa e cai para a v2, sem o min_authority", async () => {
  process.env.KNOWLEDGE_RPC_V3 = "1";
  missing.add("match_knowledge_v3");
  const hits = await retrieveKnowledgeHits(getClient(), "prazo", "legal", 4, {
    ...ONLY_KB,
    filters: { status: "any" },
  });
  assert.deepEqual(rpcCalls.map((c) => c.fn), ["match_knowledge_v3", "match_knowledge_v2"]);
  assert.deepEqual(rpcCalls[1].body.filters, { status: "any" });
  assert.equal(hits.length, 1);
  assert.ok(!("authority" in hits[0].metadata));
  assert.ok(warnings.some((w) => w.includes("f3b_authority_v3.sql") && w.includes("match_knowledge_v2")));
});

test("sem v3 nem v2: cai até à match_knowledge (o RAG não fica vazio)", async () => {
  process.env.KNOWLEDGE_RPC_V3 = "1";
  missing.add("match_knowledge_v3");
  missing.add("match_knowledge_v2");
  const hits = await retrieveKnowledgeHits(getClient(), "prazo", "legal", 4, ONLY_KB);
  assert.deepEqual(rpcCalls.map((c) => c.fn), ["match_knowledge_v3", "match_knowledge_v2", "match_knowledge"]);
  assert.deepEqual(Object.keys(rpcCalls[2].body).sort(), ["match_agent_id", "match_count", "query_embedding"]);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].metadata, null);
  assert.ok(warnings.some((w) => w.includes("f3_provenance_retrieve.sql")));
});

test("min_authority sem a v3 a responder: nenhum hit (nunca fontes por verificar)", async () => {
  for (const setup of [
    () => { process.env.KNOWLEDGE_RPC_V2 = "1"; }, // só a v2 ligada
    () => { process.env.KNOWLEDGE_RPC_V3 = "1"; missing.add("match_knowledge_v3"); }, // v3 por criar
    () => {}, // sem flags (v1)
  ]) {
    rpcCalls.length = 0;
    warnings.length = 0;
    missing.clear();
    delete process.env.KNOWLEDGE_RPC_V2;
    delete process.env.KNOWLEDGE_RPC_V3;
    setup();
    const hits = await retrieveKnowledgeHits(getClient(), "prazo", "legal", 4, {
      ...ONLY_KB,
      filters: { min_authority: "oficial" },
    });
    assert.deepEqual(hits, []);
    assert.ok(warnings.some((w) => w.includes("min_authority=oficial")));
    for (const call of rpcCalls.filter((c) => c.fn !== "match_knowledge_v3")) {
      assert.ok(!call.body.filters || !("min_authority" in call.body.filters), call.fn);
    }
  }
});

test("o contexto dos agentes também usa a v3", async () => {
  process.env.KNOWLEDGE_RPC_V3 = "1";
  const out = await retrieveContextDetailed(getClient(), "legal", "prazo", ONLY_KB);
  assert.equal(out.hitCount, 1);
  assert.equal(rpcCalls[0].fn, "match_knowledge_v3");
  assert.deepEqual(rpcCalls[0].body.filters, {});
});

test("a flag só liga com '1'", () => {
  for (const value of ["true", "yes", "0", ""]) {
    process.env.KNOWLEDGE_RPC_V3 = value;
    assert.equal(knowledgeRpcV3Enabled(), false, value);
  }
  process.env.KNOWLEDGE_RPC_V3 = "1";
  assert.equal(knowledgeRpcV3Enabled(), true);
});

test("sanitizeKnowledgeFilters: min_authority só com um dos 3 níveis", () => {
  for (const level of ["oficial", "curado", "experimental"]) {
    assert.deepEqual(sanitizeKnowledgeFilters({ min_authority: level }).filters, { min_authority: level });
  }
  for (const bad of ["maxima", "", 3, "OFICIAL"]) {
    const { filters, ignored } = sanitizeKnowledgeFilters({ min_authority: bad });
    assert.deepEqual(filters, {}, String(bad));
    assert.deepEqual(ignored, ["min_authority"]);
  }
});
