import { createClient } from "@supabase/supabase-js";
import { sessaoValida } from "./_lib/session.js";

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

  // 1. Tarefas em curso ou pendentes na VM (code_tasks)
  const { data: tarefasAtivas } = await supabase
    .from("code_tasks")
    .select("id, status, prompt, project_path, created_at, started_at")
    .in("status", ["pending", "running"])
    .order("created_at", { ascending: true });

  // 2. Últimas execuções registadas (agent_log) — feed de atividade
  const { data: atividadeRecente } = await supabase
    .from("agent_log")
    .select("id, agent, summary, success, fast_path, custo_estimado, origem, created_at")
    .order("created_at", { ascending: false })
    .limit(30);

  // 3. As 5 métricas do núcleo PCU, calculadas sobre os últimos 30 dias
  const desde = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: logPeriodo } = await supabase
    .from("agent_log")
    .select("agent, fast_path, custo_estimado, success, justificativa_full_cycle")
    .gte("created_at", desde);

  let metrica = {
    total_execucoes: 0,
    pct_fast_path: 0,
    custo_total_estimado: 0,
    agentes_distintos_usados: 0,
    full_cycle_sem_justificativa: 0,
  };

  if (logPeriodo && logPeriodo.length > 0) {
    const total = logPeriodo.length;
    const fastPathCount = logPeriodo.filter((l) => l.fast_path === true).length;
    const custoTotal = logPeriodo.reduce((acc, l) => acc + (l.custo_estimado || 0), 0);
    const agentesUnicos = new Set(logPeriodo.map((l) => l.agent)).size;
    const semJustificativa = logPeriodo.filter(
      (l) => l.fast_path === false && !l.justificativa_full_cycle
    ).length;

    metrica = {
      total_execucoes: total,
      pct_fast_path: Math.round((fastPathCount / total) * 100),
      custo_total_estimado: custoTotal,
      agentes_distintos_usados: agentesUnicos,
      full_cycle_sem_justificativa: semJustificativa,
    };
  }

  // 4. Cobertura de conhecimento por agente
  const { data: projetos } = await supabase.from("projects").select("id");
  const { data: chunks } = await supabase.from("knowledge_chunks").select("agent_id");

  const totalAgentes = projetos ? projetos.length : 0;
  const agentesComConteudo = chunks
    ? new Set(chunks.map((c) => c.agent_id)).size
    : 0;

  // 5. Pendências em aberto
  const { count: pendenciasAbertas } = await supabase
    .from("pendencias_negocio")
    .select("id", { count: "exact", head: true })
    .eq("status", "pendente");

  // 6. Última tarefa concluída (para detetar se a VM está "viva")
  const { data: ultimaTarefaConcluida } = await supabase
    .from("code_tasks")
    .select("id, status, completed_at")
    .eq("status", "done")
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return Response.json({
    geradoEm: new Date().toISOString(),
    tarefasAtivas: tarefasAtivas || [],
    atividadeRecente: atividadeRecente || [],
    metricasNucleoPCU: metrica,
    cobertura: {
      totalAgentes,
      agentesComConteudo,
      agentesVazios: totalAgentes - agentesComConteudo,
    },
    pendenciasAbertas: pendenciasAbertas || 0,
    ultimaTarefaConcluida: ultimaTarefaConcluida || null,
  });
}
