import { createClient } from "@supabase/supabase-js";
import { sessaoValida } from "../_lib/session.js";

function getClient() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// Faixas calibradas na distribuição real de knowledge_chunks (15/08/2026:
// vai de 0 a 43, com 17 dos 33 agentes ainda em 0).
function classificar(chunks) {
  if (chunks === 0) return { nivel: 1, cor: "vermelho", label: "Fraca" };
  if (chunks <= 3) return { nivel: 2, cor: "laranja", label: "Razoável" };
  if (chunks <= 8) return { nivel: 3, cor: "amarelo", label: "Boa" };
  if (chunks <= 20) return { nivel: 4, cor: "verde", label: "Forte" };
  return { nivel: 5, cor: "azul", label: "Muito forte" };
}

export async function GET(request) {
  if (!sessaoValida(request.headers.get("cookie"))) {
    return Response.json({ error: "Não autorizado" }, { status: 401 });
  }

  const supabase = getClient();

  const desde30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [{ data: projetos }, { data: chunks }, { data: logs }] = await Promise.all([
    supabase.from("projects").select("id, name, status"),
    supabase.from("knowledge_chunks").select("agent_id"),
    supabase.from("agent_log").select("agent, created_at, success").gte("created_at", desde30),
  ]);

  const chunksPorAgente = new Map();
  for (const c of chunks || []) {
    chunksPorAgente.set(c.agent_id, (chunksPorAgente.get(c.agent_id) || 0) + 1);
  }

  const atividadePorAgente = new Map();
  for (const l of logs || []) {
    const atual = atividadePorAgente.get(l.agent) || { execucoes: 0, sucessos: 0, ultima: null };
    atual.execucoes += 1;
    if (l.success) atual.sucessos += 1;
    if (!atual.ultima || new Date(l.created_at) > new Date(atual.ultima)) atual.ultima = l.created_at;
    atividadePorAgente.set(l.agent, atual);
  }

  const agentes = (projetos || [])
    .map((p) => {
      const numChunks = chunksPorAgente.get(p.id) || 0;
      const atividade = atividadePorAgente.get(p.id);
      return {
        id: p.id,
        nome: p.name || p.id,
        status: p.status,
        chunks: numChunks,
        classificacao: classificar(numChunks),
        execucoes30d: atividade?.execucoes || 0,
        ultimaAtividade: atividade?.ultima || null,
      };
    })
    .sort((a, b) => b.chunks - a.chunks || a.nome.localeCompare(b.nome));

  const resumo = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const a of agentes) resumo[a.classificacao.nivel] += 1;

  return Response.json({ geradoEm: new Date().toISOString(), agentes, resumo });
}
