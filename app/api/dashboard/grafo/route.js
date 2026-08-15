import { createClient } from "@supabase/supabase-js";
import { sessaoValida } from "../_lib/session.js";

function getClient() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export async function GET(request) {
  if (!sessaoValida(request.headers.get("cookie"))) {
    return Response.json({ error: "Não autorizado" }, { status: 401 });
  }

  const supabase = getClient();

  const [{ data: projetos }, { data: capacidades }, { data: chunks }, { data: logRecente }] =
    await Promise.all([
      supabase.from("projects").select("id, name"),
      supabase.from("capabilities").select("id, agent_id, nome, status"),
      supabase.from("knowledge_chunks").select("agent_id, source"),
      supabase
        .from("agent_log")
        .select("agent, success, created_at")
        .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
    ]);

  // Última atividade e taxa de sucesso por agente, últimos 7 dias
  const atividadePorAgente = new Map();
  for (const l of logRecente || []) {
    const atual = atividadePorAgente.get(l.agent) || { execucoes: 0, sucessos: 0, ultima: null };
    atual.execucoes += 1;
    if (l.success) atual.sucessos += 1;
    if (!atual.ultima || new Date(l.created_at) > new Date(atual.ultima)) atual.ultima = l.created_at;
    atividadePorAgente.set(l.agent, atual);
  }

  // Fontes de conhecimento agregadas por (agente, source) — um nó por fonte, não por chunk
  const fontesPorChave = new Map();
  for (const c of chunks || []) {
    const chave = `${c.agent_id}::${c.source}`;
    fontesPorChave.set(chave, (fontesPorChave.get(chave) || 0) + 1);
  }

  const nos = [];
  const links = [];
  const idsAgentes = new Set((projetos || []).map((p) => p.id));

  for (const p of projetos || []) {
    const atividade = atividadePorAgente.get(p.id);
    nos.push({
      id: `agente:${p.id}`,
      tipo: "agente",
      label: p.name || p.id,
      execucoes7d: atividade?.execucoes || 0,
      ultimaAtividade: atividade?.ultima || null,
    });
  }

  for (const cap of capacidades || []) {
    if (!idsAgentes.has(cap.agent_id)) continue; // evita nós órfãos de capacidades sem agente registado
    const id = `capacidade:${cap.id}`;
    nos.push({
      id,
      tipo: "capacidade",
      label: cap.nome,
      status: cap.status,
    });
    links.push({ source: id, target: `agente:${cap.agent_id}` });
  }

  for (const [chave, n] of fontesPorChave.entries()) {
    const [agentId, source] = chave.split("::");
    if (!idsAgentes.has(agentId)) continue;
    const id = `fonte:${chave}`;
    nos.push({
      id,
      tipo: "fonte",
      label: source || "fonte desconhecida",
      chunks: n,
    });
    links.push({ source: id, target: `agente:${agentId}` });
  }

  return Response.json({
    geradoEm: new Date().toISOString(),
    nos,
    links,
    totais: {
      agentes: (projetos || []).length,
      capacidades: (capacidades || []).length,
      fontes: fontesPorChave.size,
    },
  });
}
