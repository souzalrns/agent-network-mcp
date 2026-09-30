// Fakes partilhados pelos testes do ledger (J6). Substitui globalThis.fetch
// ANTES de importar lib/: o supabase-js e o GEMINI_API_KEY são lidos na
// primeira utilização / no carregamento do módulo.

export const SUPABASE_URL = "http://supabase.test";

// Resposta real do generateContent, com o formato confirmado pelo maestro em
// 2026-09-30 (gemini-flash-lite-latest). Os números são ilustrativos.
export function geminiResponse({ withUsage = true, text = "resposta do modelo" } = {}) {
  const body = {
    candidates: [{ content: { role: "model", parts: [{ text }] }, finishReason: "STOP" }],
    modelVersion: "gemini-3.5-flash-lite",
    responseId: "h2a9atTHKLytnsEPzfmH0A0",
  };
  if (withUsage) {
    body.usageMetadata = {
      promptTokenCount: 812,
      candidatesTokenCount: 143,
      totalTokenCount: 955,
      promptTokensDetails: [{ modality: "TEXT", tokenCount: 812 }],
      serviceTier: "standard",
    };
  }
  return body;
}

// O embedContent só devolve embedding.values (sem usageMetadata).
export function embedResponse() {
  return { embedding: { values: new Array(768).fill(0.01) } };
}

export const state = {
  gemini: () => geminiResponse(),
  geminiStatus: 200,
  // Comportamento do POST /rest/v1/token_usage: "ok" | "reject" | "500" | "hang"
  ledger: "ok",
  hangMs: 1500,
  rows: [],
};

export function reset() {
  state.gemini = () => geminiResponse();
  state.geminiStatus = 200;
  state.ledger = "ok";
  state.rows = [];
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === "string" ? input : input.url;

  if (url.includes("generativelanguage.googleapis.com")) {
    if (state.geminiStatus !== 200) return new Response("quota", { status: state.geminiStatus });
    if (url.includes(":embedContent")) return json(embedResponse());
    return json(state.gemini());
  }

  if (url.startsWith(SUPABASE_URL)) {
    if (url.includes("/rest/v1/token_usage")) {
      state.rows.push(JSON.parse(init.body));
      if (state.ledger === "reject") throw new TypeError("fetch failed (Supabase em baixo)");
      if (state.ledger === "500") return json({ message: "boom" }, 500);
      if (state.ledger === "hang") {
        await new Promise((r) => setTimeout(r, state.hangMs));
      }
      return new Response(null, { status: 201 });
    }
    // project_state, agent_log, tool_evaluations, rpc match_knowledge: vazio.
    return json([]);
  }

  throw new Error(`fetch inesperado nos testes: ${url}`);
};

// Espera (sem bloquear) que o ledger grave `n` linhas, até `ms`.
export async function waitForRows(n, ms = 1000) {
  const start = Date.now();
  while (state.rows.length < n && Date.now() - start < ms) {
    await new Promise((r) => setTimeout(r, 5));
  }
  return state.rows;
}
