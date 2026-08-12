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

/**
 * Regista uma execução em agent_log. Nunca lança — uma falha aqui (rede,
 * Supabase em baixo, coluna inesperada) nunca deve impedir a resposta ao
 * chamador; o erro só é reportado no stderr do servidor.
 *
 * Campos opcionais (capacidadeId, fastPath, custoEstimado,
 * justificativaFullCycle) que não forem passados ficam `undefined` e são
 * omitidos do insert (JSON.stringify descarta-os), pelo que a coluna fica
 * a NULL ou usa o DEFAULT da tabela (ex: capacidade_id = '{}').
 */
export async function logAgentCall({
  agent,
  summary,
  success,
  origem,
  capacidadeId,
  fastPath,
  custoEstimado,
  justificativaFullCycle,
}) {
  try {
    const supabase = getClient();
    if (!supabase) return;
    const { error } = await supabase.from("agent_log").insert({
      project: agent,
      agent,
      summary,
      success,
      origem,
      capacidade_id: capacidadeId,
      fast_path: fastPath,
      custo_estimado: custoEstimado,
      justificativa_full_cycle: justificativaFullCycle,
      created_at: new Date().toISOString(),
    });
    if (error) console.error("[agent_log] falha ao gravar:", error.message);
  } catch (err) {
    console.error("[agent_log] falha ao gravar:", err.message);
  }
}

/**
 * Lê a tabela tool_evaluations (banco de memória de ferramentas/soluções
 * já avaliadas — Orca, ECC, Kimi Code, etc). Usado pelo agente
 * 'radar-ferramentas' para nunca re-diagnosticar do zero algo que já foi
 * investigado. Consulta direta (não RAG/embeddings) porque a tabela é
 * pequena e muda com frequência — embeddings ficariam desatualizados.
 */
export async function getToolEvaluations() {
  try {
    const supabase = getClient();
    if (!supabase) return [];
    const { data, error } = await supabase
      .from("tool_evaluations")
      .select("nome, fonte, status, resumo, bloqueio, proximo_passo, descoberto_via, updated_at")
      .order("updated_at", { ascending: false });
    if (error) return [];
    return data ?? [];
  } catch {
    return [];
  }
}
