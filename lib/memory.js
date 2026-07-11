import { createClient } from "@supabase/supabase-js";

let client = null;

function getClient() {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null; // memória é opcional — degrada com graça
  client = createClient(url, key);
  return client;
}

export async function getProjectState(project) {
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
}

export async function logAction(project, agent, summary) {
  const supabase = getClient();
  if (!supabase) return;
  await supabase.from("agent_log").insert({
    project,
    agent,
    summary,
    created_at: new Date().toISOString(),
  });
}
