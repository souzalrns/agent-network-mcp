import { createClient } from "@supabase/supabase-js";

let client = null;

export function getClient() {
  if (client) return client;
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null; // memória é opcional — degrada com graça
  try {
    client = createClient(url, key);
    return client;
  } catch {
    // URL ou chave mal formada — a memória fica desativada, mas os
    // agentes continuam a funcionar normalmente sem ela.
    return null;
  }
}

export async function getProjectState(project) {
  try {
    const supabase = getClient();
    if (!supabase) return {};
    const { data, error } = await supabase
      .from("project_state")
      .select("key, value")
      .eq("project", project);
    if (error) return {};
    const state = {};
    for (const row of data ?? []) state[row.key] = row.value;
    return state;
  } catch {
    return {};
  }
}

/**
 * Grava (ou actualiza) uma entrada de estado persistente para um projecto.
 * Usa upsert por (project, key) — chamadas repetidas com a mesma chave
 * substituem o valor em vez de acumular linhas.
 * Nunca lança: uma falha aqui não deve impedir a resposta do agente.
 */
export async function setProjectState(project, key, value, updatedBy = null) {
  try {
    const supabase = getClient();
    if (!supabase) return { ok: false, reason: "Supabase não configurado" };
    const { error } = await supabase
      .from("project_state")
      .upsert(
        {
          project,
          key,
          value,
          updated_at: new Date().toISOString(),
          updated_by: updatedBy,
        },
        { onConflict: "project,key" }
      );
    if (error) return { ok: false, reason: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

export async function logAction(project, agent, summary) {
  try {
    const supabase = getClient();
    if (!supabase) return;
    await supabase.from("agent_log").insert({
      project,
      agent,
      summary,
      created_at: new Date().toISOString(),
    });
  } catch {
    // falha ao gravar log nunca deve impedir a resposta do agente
  }
}

/**
 * Grava uma amostra de uso do implicit caching do Gemini. Feito via Supabase
 * (em vez de só console.log) para conseguirmos consultar o hit rate real
 * através de uma tool MCP, sem depender de acesso aos logs do Vercel.
 */
export async function logCacheMetric(agent, promptTokens, cachedTokens) {
  try {
    const supabase = getClient();
    if (!supabase || !promptTokens) return;
    const hitRate = cachedTokens
      ? Math.round((cachedTokens / promptTokens) * 100)
      : 0;
    await supabase.from("cache_metrics").insert({
      agent,
      prompt_tokens: promptTokens,
      cached_tokens: cachedTokens || 0,
      hit_rate_pct: hitRate,
    });
  } catch {
    // observabilidade nunca deve impedir a resposta do agente
  }
}

/**
 * Devolve um resumo agregado do implicit caching do Gemini: médias de
 * hit rate globais e por agente, sobre as últimas `limit` amostras.
 */
export async function getCacheStats(limit = 200) {
  try {
    const supabase = getClient();
    if (!supabase) return null;
    const { data, error } = await supabase
      .from("cache_metrics")
      .select("agent, prompt_tokens, cached_tokens, hit_rate_pct, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error || !data?.length) return null;

    const totalPrompt = data.reduce((s, r) => s + r.prompt_tokens, 0);
    const totalCached = data.reduce((s, r) => s + r.cached_tokens, 0);
    const overallHitRate = totalPrompt
      ? Math.round((totalCached / totalPrompt) * 100)
      : 0;

    const byAgent = {};
    for (const row of data) {
      if (!byAgent[row.agent]) {
        byAgent[row.agent] = { samples: 0, prompt: 0, cached: 0 };
      }
      byAgent[row.agent].samples += 1;
      byAgent[row.agent].prompt += row.prompt_tokens;
      byAgent[row.agent].cached += row.cached_tokens;
    }
    const perAgent = Object.entries(byAgent).map(([agent, v]) => ({
      agent,
      samples: v.samples,
      hitRatePct: v.prompt ? Math.round((v.cached / v.prompt) * 100) : 0,
    }));

    return {
      samples: data.length,
      totalPromptTokens: totalPrompt,
      totalCachedTokens: totalCached,
      overallHitRatePct: overallHitRate,
      perAgent,
    };
  } catch {
    return null;
  }
}
