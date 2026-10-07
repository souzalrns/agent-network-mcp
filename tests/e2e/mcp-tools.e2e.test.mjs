// E2E das 9 tools MCP contra um `next start` real (build de produção).
// Prova que cada tool recebe os argumentos do tools/call (regressão de
// 024e0ee: com server.tool(nome, desc, z.object().strict(), cb) o SDK
// 1.26.0 tratava o schema como annotations e os argumentos chegavam undefined)
// e que o .strict() continua a rejeitar chaves extra.
//
// Correr: npx next build && node --test tests/e2e/*.test.mjs
// (sem script no package.json de propósito: evita conflito com o PR #8 do J6)
// Gemini e Supabase são simulados em tests/e2e/fetch-mock.mjs; nada sai para a rede.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PRELOAD = pathToFileURL(path.join(ROOT, "tests/e2e/fetch-mock.mjs")).href;
const PORT = 3400 + Math.floor(Math.random() * 90);
const BASE = `http://localhost:${PORT}`;
const KEY = "e2e-mcp-key-0123456789abcdef";
const LOG = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "mcp-e2e-")), "calls.jsonl");

let server;
let rpcId = 0;

before(async () => {
  assert.ok(
    fs.existsSync(path.join(ROOT, ".next/BUILD_ID")),
    "falta o build de produção: corre `npx next build` antes"
  );
  fs.writeFileSync(LOG, "");
  server = spawn("npx", ["next", "start", "-p", String(PORT)], {
    cwd: ROOT,
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      NODE_OPTIONS: `--import ${PRELOAD}`,
      E2E_LOG: LOG,
      MCP_API_KEY: KEY,
      GEMINI_API_KEY: "e2e-fake",
      SUPABASE_URL: "http://supabase.e2e",
      SUPABASE_SERVICE_ROLE_KEY: "e2e-fake",
    },
  });
  for (let i = 0; i < 120; i++) {
    try {
      await fetch(BASE);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw new Error("next start não arrancou em 30s");
});

after(() => {
  if (server) {
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {}
  }
});

async function rpc(method, params) {
  const res = await fetch(`${BASE}/api/mcp`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });
  const raw = await res.text();
  const data = raw
    .split("\n")
    .filter((l) => l.startsWith("data: "))
    .map((l) => JSON.parse(l.slice(6)))[0];
  return data ?? JSON.parse(raw);
}

async function call(name, args) {
  const msg = await rpc("tools/call", { name, arguments: args });
  return msg;
}

function text(msg) {
  assert.ok(msg.result, `sem result: ${JSON.stringify(msg).slice(0, 300)}`);
  assert.notEqual(msg.result.isError, true, `tool devolveu erro: ${JSON.stringify(msg.result)}`);
  return msg.result.content[0].text;
}

function rejected(msg) {
  return Boolean(msg.error) || msg.result?.isError === true;
}

// Pedidos registados pelo fetch-mock desde a posição `from` do log.
function calls(from = 0) {
  return fs
    .readFileSync(LOG, "utf8")
    .split("\n")
    .filter(Boolean)
    .slice(from)
    .map((l) => JSON.parse(l));
}
const mark = () => calls().length;

const EXPECTED = {
  list_agents: { props: [], required: [] },
  ask_agent_network: { props: ["request"], required: ["request"] },
  run_specific_agent: { props: ["agent", "request"], required: ["agent", "request"] },
  save_project_state: { props: ["agent", "key", "value"], required: ["agent", "key", "value"] },
  ingest_knowledge: { props: ["agent", "source", "text", "kb"], required: ["agent", "source", "text"] },
  retrieve_knowledge: {
    props: ["kb", "query", "top_k", "filters", "require_citations"],
    required: ["kb", "query"],
  },
  dispatch_code_task: {
    props: ["prompt", "project_path", "allowed_tools"],
    required: ["prompt", "project_path"],
  },
  check_code_task: { props: ["id"], required: [] },
  log_execution: {
    props: [
      "agent",
      "demanda_resumo",
      "capacidade_id",
      "fast_path",
      "custo_estimado",
      "sucesso",
      "justificativa_full_cycle",
    ],
    required: ["agent", "demanda_resumo", "fast_path", "sucesso"],
  },
};

test("tools/list: as 9 tools anunciam o inputSchema real, com additionalProperties=false", async () => {
  const msg = await rpc("tools/list", {});
  const tools = Object.fromEntries(msg.result.tools.map((t) => [t.name, t]));
  assert.deepEqual(Object.keys(tools).sort(), Object.keys(EXPECTED).sort());
  for (const [name, exp] of Object.entries(EXPECTED)) {
    const schema = tools[name].inputSchema;
    assert.deepEqual(Object.keys(schema.properties ?? {}).sort(), [...exp.props].sort(), name);
    assert.deepEqual([...(schema.required ?? [])].sort(), [...exp.required].sort(), name);
    assert.equal(schema.additionalProperties, false, `${name}: .strict() perdido`);
    assert.equal(tools[name].annotations, undefined, `${name}: schema tratado como annotations`);
  }
});

test("list_agents", async () => {
  assert.ok(text(await call("list_agents", {})).includes("mesaflow: "));
});

test("ask_agent_network: o pedido chega ao router e ao agente", async () => {
  const m = mark();
  const out = text(await call("ask_agent_network", { request: "PEDIDO-ASK-123" }));
  assert.equal(out, "[Agente: mesaflow]\n\nresposta e2e do agente");
  const gen = calls(m).filter((c) => c.kind === "gemini" && c.url.includes(":generateContent"));
  assert.equal(gen.length, 2, "router + agente");
  for (const g of gen) assert.ok(JSON.stringify(g.body).includes("PEDIDO-ASK-123"));
});

test("run_specific_agent: agent e request chegam", async () => {
  const m = mark();
  assert.equal(
    text(await call("run_specific_agent", { agent: "mesaflow", request: "PEDIDO-RUN-456" })),
    "resposta e2e do agente"
  );
  const c = calls(m);
  const gen = c.filter((x) => x.kind === "gemini" && x.url.includes(":generateContent"));
  assert.equal(gen.length, 1);
  assert.ok(JSON.stringify(gen[0].body).includes("PEDIDO-RUN-456"));
  const state = c.find((x) => x.path === "project_state" && x.method === "POST");
  assert.equal(state.body.project, "mesaflow");
  assert.equal(state.body.value.request, "PEDIDO-RUN-456");
});

test("save_project_state: agent, key e value chegam", async () => {
  const m = mark();
  assert.equal(
    text(await call("save_project_state", { agent: "mesaflow", key: "chave_e2e", value: '{"a":1}' })),
    "Estado guardado: mesaflow.chave_e2e"
  );
  const up = calls(m).find((x) => x.path === "project_state" && x.method === "POST");
  assert.equal(up.body.project, "mesaflow");
  assert.equal(up.body.key, "chave_e2e");
  assert.deepEqual(up.body.value, { a: 1 });
});

test("ingest_knowledge: agent, source e text chegam", async () => {
  const m = mark();
  const out = text(
    await call("ingest_knowledge", { agent: "mesaflow", source: "fonte-e2e", text: "TEXTO-INGEST-789" })
  );
  assert.ok(out.startsWith("Ingerido para 'mesaflow' (source=fonte-e2e, kb=mesaflow): 1/1 pedaços"), out);
  const c = calls(m);
  const embed = c.find((x) => x.kind === "gemini" && x.url.includes(":embedContent"));
  assert.equal(embed.body.content.parts[0].text, "TEXTO-INGEST-789");
  const del = c.find((x) => x.path === "knowledge_chunks" && x.method === "DELETE");
  assert.ok(del.query.includes("agent_id=eq.mesaflow") && del.query.includes("source=eq.fonte-e2e"));
  const ins = c.find((x) => x.path === "knowledge_chunks" && x.method === "POST");
  assert.equal(ins.body.content, "TEXTO-INGEST-789");
  assert.equal(ins.body.agent_id, "mesaflow");
  assert.equal(ins.body.kb, "mesaflow"); // R-005 / P-20
});

test("ingest_knowledge: kb explícito chega ao insert; kb inválido é recusado", async () => {
  const m = mark();
  const out = text(
    await call("ingest_knowledge", { agent: "revisor-codigo", source: "fonte-sec", text: "T", kb: "security" })
  );
  assert.ok(out.includes("kb=security"), out);
  const ins = calls(m).find((x) => x.path === "knowledge_chunks" && x.method === "POST");
  assert.equal(ins.body.kb, "security");
  assert.equal(ins.body.agent_id, "revisor-codigo");
  const n = mark();
  assert.ok(rejected(await call("ingest_knowledge", { agent: "mesaflow", source: "f", text: "T", kb: "Not Valid" })));
  assert.equal(calls(n).filter((x) => x.path === "knowledge_chunks").length, 0);
});

test("retrieve_knowledge: kb, query e top_k chegam", async () => {
  const m = mark();
  const out = JSON.parse(
    text(await call("retrieve_knowledge", { kb: "global", query: "PERGUNTA-E2E", top_k: 3 }))
  );
  assert.equal(out.hitCount, 1);
  assert.equal(out.hits[0].citation.source, "fonte-e2e");
  const c = calls(m);
  const embed = c.find((x) => x.kind === "gemini" && x.url.includes(":embedContent"));
  assert.equal(embed.body.content.parts[0].text, "PERGUNTA-E2E");
  const rpcCall = c.find((x) => x.path === "rpc/match_knowledge");
  assert.equal(rpcCall.body.match_agent_id, "global");
  assert.equal(rpcCall.body.match_count, 6); // fetchK = min(max(top_k*2, top_k), 24)
});

test("dispatch_code_task: prompt, project_path e allowed_tools chegam", async () => {
  const m = mark();
  const out = text(
    await call("dispatch_code_task", {
      prompt: "PROMPT-E2E",
      project_path: "/tmp/projeto-e2e",
      allowed_tools: "Read,Grep",
    })
  );
  assert.ok(out.startsWith("Tarefa criada (id: task-e2e-1)"), out);
  const ins = calls(m).find((x) => x.path === "code_tasks" && x.method === "POST");
  assert.deepEqual(ins.body, {
    prompt: "PROMPT-E2E",
    project_path: "/tmp/projeto-e2e",
    status: "pending",
    allowed_tools: "Read,Grep",
  });
});

test("check_code_task: id chega", async () => {
  const m = mark();
  const out = text(await call("check_code_task", { id: "task-e2e-1" }));
  assert.ok(out.startsWith("[done] task-e2e-1"), out);
  const get = calls(m).find((x) => x.path === "code_tasks" && x.method === "GET");
  assert.ok(get.query.includes("id=eq.task-e2e-1"), get.query);
});

test("log_execution: agent, demanda_resumo, fast_path e sucesso chegam", async () => {
  const m = mark();
  assert.equal(
    text(
      await call("log_execution", {
        agent: "mesaflow",
        demanda_resumo: "RESUMO-E2E",
        fast_path: true,
        sucesso: false,
      })
    ),
    "Execução registada para mesaflow."
  );
  const ins = calls(m).find((x) => x.path === "agent_log" && x.method === "POST");
  assert.equal(ins.body.agent, "mesaflow");
  assert.equal(ins.body.summary, "RESUMO-E2E");
  assert.equal(ins.body.success, false);
  assert.equal(ins.body.origem, "orquestrador_manual");
  assert.equal(ins.body.fast_path, true);
  // Opcionais não enviados ficam fora do insert (a coluna usa o DEFAULT).
  for (const col of ["capacidade_id", "custo_estimado", "justificativa_full_cycle", "meta"]) {
    assert.equal(col in ins.body, false, `${col} não devia ir no insert`);
  }
});

test("log_execution: os 4 campos opcionais chegam ao agent_log", async () => {
  const m = mark();
  assert.equal(
    text(
      await call("log_execution", {
        agent: "mesaflow",
        demanda_resumo: "RESUMO-META-E2E",
        capacidade_id: ["cap-e2e-1", "cap-e2e-2"],
        fast_path: false,
        custo_estimado: 42,
        sucesso: true,
        justificativa_full_cycle: "JUSTIFICATIVA-E2E",
      })
    ),
    "Execução registada para mesaflow."
  );
  const ins = calls(m).find((x) => x.path === "agent_log" && x.method === "POST");
  assert.deepEqual(ins.body.capacidade_id, ["cap-e2e-1", "cap-e2e-2"]);
  assert.equal(ins.body.fast_path, false);
  assert.equal(ins.body.custo_estimado, 42);
  assert.equal(ins.body.justificativa_full_cycle, "JUSTIFICATIVA-E2E");
  assert.equal(ins.body.summary, "RESUMO-META-E2E");
  assert.equal(ins.body.success, true);
  assert.equal("meta" in ins.body, false);
});

test(".strict(): chave extra é rejeitada e a tool não corre", async () => {
  const m = mark();
  const msg = await call("run_specific_agent", {
    agent: "mesaflow",
    request: "x",
    campo_extra: "nao-permitido",
  });
  assert.ok(rejected(msg), JSON.stringify(msg).slice(0, 300));
  assert.deepEqual(calls(m), [], "nenhuma chamada à Gemini nem ao Supabase");
});

test("campo obrigatório em falta é rejeitado e a tool não corre", async () => {
  const m = mark();
  const msg = await call("save_project_state", { agent: "mesaflow", key: "k" });
  assert.ok(rejected(msg), JSON.stringify(msg).slice(0, 300));
  assert.deepEqual(calls(m), []);
});
