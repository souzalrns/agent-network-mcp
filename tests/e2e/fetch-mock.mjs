// Preload do e2e das tools MCP (node --import, dentro do processo `next start`).
// Simula a API Gemini e o Supabase (PostgREST) e regista cada pedido em
// E2E_LOG (JSONL), para o teste provar que as tools receberam os argumentos
// reais. Nunca sai para a rede: um URL desconhecido é um erro.
import fs from "node:fs";

const LOG = process.env.E2E_LOG;
export const SUPABASE_URL = "http://supabase.e2e";

function log(entry) {
  fs.appendFileSync(LOG, JSON.stringify(entry) + "\n");
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

const realFetch = globalThis.fetch;

globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === "string" ? input : input.url;
  const method = (init.method || (typeof input === "object" && input.method) || "GET").toUpperCase();
  const body = typeof init.body === "string" ? init.body : null;

  if (url.startsWith("https://generativelanguage.googleapis.com/")) {
    log({ kind: "gemini", url: url.replace(/key=[^&]+/, "key=***"), body: JSON.parse(body) });
    if (url.includes(":embedContent")) {
      return json({ embedding: { values: new Array(768).fill(0.01) } });
    }
    const isRouter = body.includes("És o router de um sistema multiagente");
    const text = isRouter
      ? JSON.stringify({ agent: "mesaflow", reason: "e2e" })
      : "resposta e2e do agente";
    return json({ candidates: [{ content: { parts: [{ text }] } }] });
  }

  if (url.startsWith(SUPABASE_URL)) {
    const u = new URL(url);
    const path = u.pathname.replace("/rest/v1/", "");
    log({ kind: "supabase", method, path, query: u.search, body: body ? JSON.parse(body) : null });

    if (path === "rpc/match_knowledge") {
      return json([{ id: "chunk-e2e-1", content: "conteudo e2e", source: "fonte-e2e", similarity: 0.9 }]);
    }
    if (path === "code_tasks" && method === "POST") {
      return json({ id: "task-e2e-1" }, 201);
    }
    if (path === "code_tasks" && method === "GET") {
      return json({
        id: "task-e2e-1",
        status: "done",
        prompt: "PROMPT-E2E",
        project_path: "/tmp/projeto-e2e",
        result: "resultado e2e",
      });
    }
    if (method === "DELETE") return new Response(null, { status: 204, headers: { "Content-Range": "*/0" } });
    if (method === "GET") return json([]);
    return new Response(null, { status: 201 });
  }

  // O próprio teste fala com o servidor em localhost; tudo o resto é proibido.
  if (url.startsWith("http://localhost") || url.startsWith("http://127.0.0.1")) {
    return realFetch(input, init);
  }
  throw new Error(`fetch inesperado no e2e: ${url}`);
};
