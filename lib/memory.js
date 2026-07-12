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
