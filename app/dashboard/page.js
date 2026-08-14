"use client";

import { useState, useEffect, useCallback } from "react";

const CORES = {
  fundo: "#0f1115",
  cartao: "#181b21",
  borda: "#2a2e37",
  texto: "#e6e6e6",
  textoFraco: "#8b8f98",
  verde: "#4ade80",
  amarelo: "#facc15",
  vermelho: "#f87171",
  azul: "#60a5fa",
};

function tempoRelativo(iso) {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diffMs / 1000);
  if (s < 60) return `há ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h${m % 60}min`;
  const d = Math.floor(h / 24);
  return `há ${d}d`;
}

function Cartao({ titulo, children, destaque }) {
  return (
    <div
      style={{
        background: CORES.cartao,
        border: `1px solid ${destaque || CORES.borda}`,
        borderRadius: 10,
        padding: "1rem 1.25rem",
      }}
    >
      <div style={{ color: CORES.textoFraco, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
        {titulo}
      </div>
      {children}
    </div>
  );
}

export default function DashboardPage() {
  const [secret, setSecret] = useState("");
  const [autenticado, setAutenticado] = useState(false);
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState(null);

  const buscar = useCallback(async (s) => {
    try {
      const res = await fetch("/api/dashboard", {
        headers: { "x-dashboard-secret": s },
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErro(d.error || `Erro ${res.status}`);
        return;
      }
      const d = await res.json();
      setDados(d);
      setErro(null);
      setUltimaAtualizacao(new Date());
    } catch (e) {
      setErro(e.message);
    }
  }, []);

  useEffect(() => {
    if (!autenticado) return;
    buscar(secret);
    const intervalo = setInterval(() => buscar(secret), 4000);
    return () => clearInterval(intervalo);
  }, [autenticado, secret, buscar]);

  if (!autenticado) {
    return (
      <main style={{ background: CORES.fundo, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif" }}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setAutenticado(true);
          }}
          style={{ background: CORES.cartao, padding: "2rem", borderRadius: 12, border: `1px solid ${CORES.borda}`, width: 320 }}
        >
          <h1 style={{ color: CORES.texto, fontSize: 18, marginBottom: 16 }}>Dashboard — Rede de Agentes</h1>
          <input
            type="password"
            placeholder="Chave secreta (INGEST_SECRET)"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            required
            style={{ width: "100%", padding: "0.6rem", borderRadius: 6, border: `1px solid ${CORES.borda}`, background: "#0f1115", color: CORES.texto, marginBottom: 12 }}
          />
          <button type="submit" style={{ width: "100%", padding: "0.6rem", borderRadius: 6, border: "none", background: CORES.azul, color: "#0f1115", fontWeight: 600, cursor: "pointer" }}>
            Entrar
          </button>
        </form>
      </main>
    );
  }

  const vmViva = dados?.ultimaTarefaConcluida?.completed_at
    ? Date.now() - new Date(dados.ultimaTarefaConcluida.completed_at).getTime() < 24 * 60 * 60 * 1000
    : null;

  return (
    <main style={{ background: CORES.fundo, minHeight: "100vh", fontFamily: "system-ui, sans-serif", padding: "1.5rem", color: CORES.texto }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>🔴 Rede de Agentes LRNSdigital — ao vivo</h1>
        <div style={{ color: CORES.textoFraco, fontSize: 12 }}>
          {erro ? <span style={{ color: CORES.vermelho }}>⚠ {erro}</span> : `atualizado ${ultimaAtualizacao ? tempoRelativo(ultimaAtualizacao.toISOString()) : "..."}`}
        </div>
      </div>

      {dados && (
        <>
          {/* Tarefas ativas agora */}
          <Cartao
            titulo={`Tarefas ativas agora na VM (${dados.tarefasAtivas.length})`}
            destaque={dados.tarefasAtivas.length > 0 ? CORES.amarelo : undefined}
          >
            {dados.tarefasAtivas.length === 0 ? (
              <div style={{ color: CORES.textoFraco }}>Nenhuma — worker livre.</div>
            ) : (
              dados.tarefasAtivas.map((t) => (
                <div key={t.id} style={{ borderTop: `1px solid ${CORES.borda}`, paddingTop: 8, marginTop: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: t.status === "running" ? CORES.amarelo : CORES.textoFraco, fontWeight: 600 }}>
                      {t.status === "running" ? "▶ A CORRER" : "⏳ EM FILA"}
                    </span>
                    <span style={{ color: CORES.textoFraco, fontSize: 12 }}>
                      {t.started_at ? `desde ${tempoRelativo(t.started_at)}` : `criada ${tempoRelativo(t.created_at)}`}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, marginTop: 4 }}>{t.project_path}</div>
                  <div style={{ fontSize: 12, color: CORES.textoFraco, marginTop: 2 }}>{(t.prompt || "").slice(0, 140)}…</div>
                </div>
              ))
            )}
          </Cartao>

          {/* Grelha de métricas + estado */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginTop: 12 }}>
            <Cartao titulo="Estado da VM">
              <div style={{ fontSize: 22, fontWeight: 700, color: vmViva ? CORES.verde : CORES.vermelho }}>
                {vmViva === null ? "—" : vmViva ? "● Ativa" : "○ Sem sinal 24h+"}
              </div>
              <div style={{ fontSize: 12, color: CORES.textoFraco, marginTop: 4 }}>
                Última tarefa concluída: {dados.ultimaTarefaConcluida ? tempoRelativo(dados.ultimaTarefaConcluida.completed_at) : "sem dados"}
              </div>
            </Cartao>

            <Cartao titulo="% Fast-Path (30 dias)">
              <div style={{ fontSize: 22, fontWeight: 700 }}>{dados.metricasNucleoPCU.pct_fast_path}%</div>
              <div style={{ fontSize: 12, color: CORES.textoFraco, marginTop: 4 }}>{dados.metricasNucleoPCU.total_execucoes} execuções no período</div>
            </Cartao>

            <Cartao titulo="Custo cognitivo (30 dias)">
              <div style={{ fontSize: 22, fontWeight: 700 }}>{dados.metricasNucleoPCU.custo_total_estimado.toLocaleString("pt-PT")}</div>
              <div style={{ fontSize: 12, color: CORES.textoFraco, marginTop: 4 }}>unidades estimadas</div>
            </Cartao>

            <Cartao titulo="Full Cycle sem justificação">
              <div style={{ fontSize: 22, fontWeight: 700, color: dados.metricasNucleoPCU.full_cycle_sem_justificativa > 0 ? CORES.vermelho : CORES.verde }}>
                {dados.metricasNucleoPCU.full_cycle_sem_justificativa}
              </div>
              <div style={{ fontSize: 12, color: CORES.textoFraco, marginTop: 4 }}>deve ser sempre 0 (Constituição PCU)</div>
            </Cartao>

            <Cartao titulo="Cobertura de conhecimento">
              <div style={{ fontSize: 22, fontWeight: 700 }}>
                {dados.cobertura.agentesComConteudo}/{dados.cobertura.totalAgentes}
              </div>
              <div style={{ fontSize: 12, color: CORES.textoFraco, marginTop: 4 }}>{dados.cobertura.agentesVazios} agentes ainda vazios</div>
            </Cartao>

            <Cartao titulo="Pendências em aberto">
              <div style={{ fontSize: 22, fontWeight: 700 }}>{dados.pendenciasAbertas}</div>
              <div style={{ fontSize: 12, color: CORES.textoFraco, marginTop: 4 }}>em pendencias_negocio</div>
            </Cartao>
          </div>

          {/* Feed de atividade recente */}
          <div style={{ marginTop: 12 }}>
            <Cartao titulo={`Atividade recente (últimas ${dados.atividadeRecente.length})`}>
              <div style={{ maxHeight: 420, overflowY: "auto" }}>
                {dados.atividadeRecente.map((a) => (
                  <div
                    key={a.id}
                    style={{
                      display: "flex",
                      gap: 10,
                      padding: "6px 0",
                      borderTop: `1px solid ${CORES.borda}`,
                      alignItems: "flex-start",
                    }}
                  >
                    <span style={{ color: a.success ? CORES.verde : CORES.vermelho, fontSize: 14, lineHeight: "20px" }}>
                      {a.success ? "✓" : "✕"}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13 }}>
                        <b>{a.agent}</b>{" "}
                        <span style={{ color: CORES.textoFraco }}>
                          ({a.fast_path ? "fast-path" : "full-cycle"} · {a.origem})
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: CORES.textoFraco }}>{a.summary}</div>
                    </div>
                    <span style={{ fontSize: 11, color: CORES.textoFraco, whiteSpace: "nowrap" }}>{tempoRelativo(a.created_at)}</span>
                  </div>
                ))}
              </div>
            </Cartao>
          </div>
        </>
      )}
    </main>
  );
}
