// J6: o ledger de tokens nunca pode fazer falhar nem atrasar a resposta.
// Corre com: npm test   (node --test, sem dependências novas)
import { test, beforeEach, after as afterAll } from "node:test";
import assert from "node:assert/strict";

import { SUPABASE_URL, state, reset, geminiResponse, waitForRows } from "./_fakes.mjs";

process.env.GEMINI_API_KEY = "test-key";
process.env.SUPABASE_URL = SUPABASE_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";

const { callGemini, routeRequest, runAgent } = await import("../lib/agentRuntime.js");
const { embedText, retrieveKnowledgeHits } = await import("../lib/knowledge.js");
const { buildUsageRow, recordTokenUsage } = await import("../lib/tokenLedger.js");
const { AGENTS } = await import("../lib/agents.js");
const { getClient } = await import("../lib/memory.js");

const unhandled = [];
process.on("unhandledRejection", (err) => unhandled.push(err));

beforeEach(() => reset());

afterAll(() => {
  assert.deepEqual(unhandled, [], "nenhuma promessa rejeitada ficou por tratar");
});

test("linha completa a partir do formato real do generateContent", async () => {
  const text = await callGemini("sys", "olá", 100, {
    runId: "11111111-1111-4111-8111-111111111111",
    agentId: "mesaflow",
    callKind: "agent",
  });
  assert.equal(text, "resposta do modelo");

  const [row] = await waitForRows(1);
  assert.deepEqual(row, {
    run_id: "11111111-1111-4111-8111-111111111111",
    agent_id: "mesaflow",
    call_kind: "agent",
    model: "gemini-flash-lite-latest",
    model_version: "gemini-3.5-flash-lite",
    tokens_in: 812,
    tokens_out: 143,
    tokens_total: 955,
    status: "ok",
    raw_usage: geminiResponse().usageMetadata,
    service_tier: "standard",
    response_id: "h2a9atTHKLytnsEPzfmH0A0",
  });
});

for (const mode of ["reject", "500"]) {
  test(`Supabase a falhar (${mode}): a resposta chega igual e nada lança`, async () => {
    state.ledger = mode;
    const text = await callGemini("sys", "olá");
    assert.equal(text, "resposta do modelo");
    await waitForRows(1);
    await new Promise((r) => setTimeout(r, 20)); // deixa o insert acabar de falhar
  });
}

test("Supabase lento: callGemini não espera pela escrita", async () => {
  state.ledger = "hang";
  state.hangMs = 1500;
  const t0 = Date.now();
  const text = await callGemini("sys", "olá");
  const elapsed = Date.now() - t0;
  assert.equal(text, "resposta do modelo");
  assert.ok(elapsed < 300, `callGemini demorou ${elapsed}ms com o Supabase pendurado 1500ms`);
  // A escrita só arranca depois de a resposta sair; espera que arranque para
  // a linha não cair no teste seguinte.
  await waitForRows(1);
});

test("usageMetadata ausente: resposta igual, linha missing_usage com tokens NULL", async () => {
  state.gemini = () => geminiResponse({ withUsage: false });
  const text = await callGemini("sys", "olá", 100, { callKind: "router" });
  assert.equal(text, "resposta do modelo");

  const [row] = await waitForRows(1);
  assert.equal(row.status, "missing_usage");
  assert.equal(row.tokens_in, null);
  assert.equal(row.tokens_out, null);
  assert.equal(row.tokens_total, null);
  assert.equal(row.raw_usage, null);
  assert.equal(row.service_tier, null);
  assert.equal(row.model_version, "gemini-3.5-flash-lite");
});

test("usageMetadata malformado não quebra nada", () => {
  for (const usage of [null, "x", 42, [], { promptTokenCount: "812" }]) {
    const row = buildUsageRow(
      { callKind: "agent", model: "m" },
      { ...geminiResponse(), usageMetadata: usage }
    );
    assert.equal(row.tokens_in, null);
  }
  // Resposta que lança ao ser lida: recordTokenUsage engole e segue.
  const evil = {
    get usageMetadata() {
      throw new Error("getter partido");
    },
  };
  assert.doesNotThrow(() => recordTokenUsage({ callKind: "agent", model: "m" }, evil));
});

test("embedText: devolve o vector e grava missing_usage (embed_query / embed_doc)", async () => {
  const q = await embedText("pergunta", "RETRIEVAL_QUERY", { runId: null, agentId: "mesaflow" });
  const d = await embedText("documento", "RETRIEVAL_DOCUMENT");
  assert.equal(q.length, 768);
  assert.equal(d.length, 768);

  const rows = await waitForRows(2);
  assert.deepEqual(
    rows.map((r) => [r.call_kind, r.model, r.status, r.tokens_total, r.agent_id]),
    [
      ["embed_query", "gemini-embedding-001", "missing_usage", null, "mesaflow"],
      ["embed_doc", "gemini-embedding-001", "missing_usage", null, null],
    ]
  );
});

test("embedText com Supabase a falhar: o vector chega igual", async () => {
  state.ledger = "reject";
  const v = await embedText("pergunta", "RETRIEVAL_QUERY");
  assert.equal(v.length, 768);
  await waitForRows(1);
});

test("erro da API Gemini: mesmo erro de antes e nenhuma linha", async () => {
  state.geminiStatus = 429;
  await assert.rejects(() => callGemini("sys", "olá"), /Erro na API Gemini \(429\)/);
  await assert.rejects(() => embedText("x"), /Erro ao gerar embedding \(429\)/);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(state.rows.length, 0);
});

test("pedido completo (router + runAgent): mesmo run_id nas 3 linhas", async () => {
  const agentId = Object.keys(AGENTS)[0];
  state.gemini = () => ({
    ...geminiResponse({ text: JSON.stringify({ agent: agentId, reason: "teste" }) }),
  });
  const runId = "22222222-2222-4222-8222-222222222222";

  const routed = await routeRequest("pedido", { runId });
  assert.equal(routed.agent, agentId);
  await runAgent(agentId, "pedido", { runId });

  const rows = await waitForRows(3);
  assert.deepEqual(
    rows.map((r) => [r.call_kind, r.agent_id, r.run_id]),
    [
      ["router", null, runId],
      ["embed_query", agentId, runId],
      ["agent", agentId, runId],
    ]
  );
});

test("retrieveKnowledgeHits passa run_id e kb ao ledger", async () => {
  const hits = await retrieveKnowledgeHits(getClient(), "pergunta", "global", 4, {
    runId: "33333333-3333-4333-8333-333333333333",
  });
  assert.deepEqual(hits, []);
  const [row] = await waitForRows(1);
  assert.equal(row.call_kind, "embed_query");
  assert.equal(row.agent_id, "global");
  assert.equal(row.run_id, "33333333-3333-4333-8333-333333333333");
});
