import { createClient } from "@supabase/supabase-js";
import { sessaoValida } from "../_lib/session.js";

function getClient() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

const PESO_PRIORIDADE = { alta: 0, media: 1, baixa: 2 };

export async function GET(request) {
  if (!sessaoValida(request.headers.get("cookie"))) {
    return Response.json({ error: "Não autorizado" }, { status: 401 });
  }

  const supabase = getClient();

  const [
    { data: pendencias },
    { data: projetos },
    { data: agentLogTudo },
    { data: codeTasks },
  ] = await Promise.all([
    supabase
      .from("pendencias_negocio")
      .select("id, area_slug, area_label, titulo, status, prioridade, tipo, requer_intervencao_humana, bloqueado_por, prazo, created_at")
      .eq("status", "pendente"),
    supabase.from("projects").select("id, name, status"),
    supabase.from("agent_log").select("agent, custo_estimado"),
    supabase.from("code_tasks").select("status"),
  ]);

  const pendentes = pendencias || [];

  // Sidebar: áreas com contagem total / precisa-de-ti / autónoma
  const areasMap = new Map();
  for (const p of pendentes) {
    const chave = p.area_slug || "sem-area";
    const atual = areasMap.get(chave) || { slug: chave, label: p.area_label || "Sem área", total: 0, precisaDeTi: 0, autonomas: 0 };
    atual.total += 1;
    if (p.requer_intervencao_humana) atual.precisaDeTi += 1;
    else atual.autonomas += 1;
    areasMap.set(chave, atual);
  }
  const areas = [...areasMap.values()].sort((a, b) => b.total - a.total);

  const ordenarFila = (lista) =>
    [...lista].sort((a, b) => {
      const pa = PESO_PRIORIDADE[a.prioridade] ?? 1;
      const pb = PESO_PRIORIDADE[b.prioridade] ?? 1;
      if (pa !== pb) return pa - pb;
      return new Date(a.created_at) - new Date(b.created_at); // mais antiga primeiro
    });

  const filaIntervencao = ordenarFila(pendentes.filter((p) => p.requer_intervencao_humana));
  const filaAutonoma = ordenarFila(pendentes.filter((p) => !p.requer_intervencao_humana));

  // Pendências mais antigas em aberto (independente de fila)
  const maisAntigas = [...pendentes]
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    .slice(0, 5)
    .map((p) => ({ ...p, idadeDias: Math.floor((Date.now() - new Date(p.created_at).getTime()) / 86400000) }));

  // Pendências por prioridade
  const porPrioridade = { alta: 0, media: 0, baixa: 0 };
  for (const p of pendentes) porPrioridade[p.prioridade] = (porPrioridade[p.prioridade] || 0) + 1;

  // Agentes nunca usados (sem nenhuma linha em agent_log, alguma vez)
  const agentesUsadosAlgumaVez = new Set((agentLogTudo || []).map((l) => l.agent));
  const agentesNuncaUsados = (projetos || [])
    .filter((p) => !agentesUsadosAlgumaVez.has(p.id))
    .map((p) => p.name || p.id);

  // Custo por agente (todo o histórico), top 5
  const custoPorAgente = new Map();
  for (const l of agentLogTudo || []) {
    custoPorAgente.set(l.agent, (custoPorAgente.get(l.agent) || 0) + (l.custo_estimado || 0));
  }
  const topCustoAgentes = [...custoPorAgente.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([agente, custo]) => ({ agente, custo }));

  // code_tasks por status
  const codeTasksPorStatus = {};
  for (const t of codeTasks || []) {
    codeTasksPorStatus[t.status] = (codeTasksPorStatus[t.status] || 0) + 1;
  }

  // Agentes mais ativos (histórico completo) — dados reais para o radar de agentes
  const contagemRadar = new Map();
  for (const l of agentLogTudo || []) {
    contagemRadar.set(l.agent, (contagemRadar.get(l.agent) || 0) + 1);
  }
  const topAgentesAtivos = [...contagemRadar.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([agente, execucoes]) => ({ agente, execucoes }));

  return Response.json({
    geradoEm: new Date().toISOString(),
    areas,
    filaIntervencao,
    filaAutonoma,
    maisAntigas,
    porPrioridade,
    agentesNuncaUsados,
    topCustoAgentes,
    topAgentesAtivos,
    codeTasksPorStatus,
    totalAgentes: (projetos || []).length,
  });
}
