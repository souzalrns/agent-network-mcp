// J6: ledger de tokens -- 1 linha em token_usage por chamada Gemini.
//
// Regra: gravar NUNCA pode fazer falhar nem atrasar a resposta ao utilizador.
// - recordTokenUsage() é síncrona, não devolve promessa e nunca lança: quem
//   chama não faz await de nada.
// - A escrita no Supabase é agendada com after() (next/server): corre depois de
//   a resposta sair, com a função mantida viva pelo Vercel (waitUntil).
// - Fora de um pedido Next (scripts, testes) after() lança; aí a escrita fica
//   como promessa solta. insertRow() nunca rejeita, erros só vão para o log.
//
// "next/server.js" (e não "next/server") para o import resolver também em Node
// puro, sem o bundler do Next -- é o mesmo ficheiro de node_modules/next.
import { after } from "next/server.js";
import { getClient } from "./memory.js";

const TABLE = "token_usage";

function intOrNull(value) {
  return Number.isInteger(value) ? value : null;
}

/**
 * Constrói a linha de token_usage a partir da resposta da API Gemini.
 * Formato confirmado com chamadas reais (gemini-flash-lite-latest,
 * 2026-09-30): usageMetadata no topo da resposta com promptTokenCount,
 * candidatesTokenCount, totalTokenCount, promptTokensDetails[] e serviceTier;
 * modelVersion (ex.: "gemini-3.5-flash-lite") e responseId também no topo.
 * O embedContent não devolve usageMetadata -- passa response = null.
 *
 * @param {{ runId?: string, agentId?: string, callKind: string, model: string }} meta
 * @param {object|null} response - JSON devolvido pela API Gemini
 */
export function buildUsageRow(meta, response) {
  const usage = response?.usageMetadata;
  const hasUsage = usage !== null && typeof usage === "object";
  return {
    run_id: meta.runId || null,
    agent_id: meta.agentId || null,
    call_kind: meta.callKind,
    model: meta.model,
    model_version: response?.modelVersion ?? null,
    tokens_in: hasUsage ? intOrNull(usage.promptTokenCount) : null,
    tokens_out: hasUsage ? intOrNull(usage.candidatesTokenCount) : null,
    tokens_total: hasUsage ? intOrNull(usage.totalTokenCount) : null,
    status: hasUsage ? "ok" : "missing_usage",
    raw_usage: hasUsage ? usage : null,
    service_tier: hasUsage ? usage.serviceTier ?? null : null,
    response_id: response?.responseId ?? null,
  };
}

async function insertRow(row) {
  try {
    const supabase = getClient();
    if (!supabase) return; // memória opcional: sem Supabase não há ledger
    const { error } = await supabase.from(TABLE).insert(row);
    if (error) console.error("[token_usage] falha ao gravar:", error.message);
  } catch (err) {
    console.error("[token_usage] falha ao gravar:", err?.message || err);
  }
}

/**
 * Regista o consumo de uma chamada Gemini. Síncrona e nunca lança.
 * Uma generateContent sem usageMetadata grava status='missing_usage' e deixa
 * um aviso no log; nos embeddings isso é o normal, por isso sem aviso.
 */
export function recordTokenUsage(meta, response) {
  try {
    const row = buildUsageRow(meta, response);
    if (row.status === "missing_usage" && response) {
      console.warn(`[token_usage] missing_usage: ${row.call_kind} ${row.model}`);
    }
    const write = () => insertRow(row);
    try {
      after(write);
    } catch {
      void write(); // fora de um pedido Next: promessa solta, nunca rejeita
    }
  } catch (err) {
    console.error("[token_usage] erro a registar:", err?.message || err);
  }
}
