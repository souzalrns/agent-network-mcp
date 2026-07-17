import { getClient } from "../../../lib/memory.js";

/**
 * Endpoint minimalista que só faz uma consulta trivial à base de dados —
 * o suficiente para resetar o temporizador de inatividade do Supabase
 * (que pausa projetos gratuitos após 7 dias sem atividade real).
 */
export async function GET() {
  const supabase = getClient();
  if (!supabase) {
    return Response.json({ ok: false, reason: "Supabase não configurado" });
  }

  try {
    await supabase.from("agent_log").select("id").limit(1);
    return Response.json({ ok: true, timestamp: new Date().toISOString() });
  } catch (err) {
    return Response.json({ ok: false, error: err.message });
  }
}
