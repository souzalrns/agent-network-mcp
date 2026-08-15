"use client";

import { useState, useEffect, useCallback } from "react";
import { CORES, tempoRelativo } from "./_lib/tema.js";

function Cartao({ titulo, children, destaque }) {
  return (
    <div
      style={{
        background: CORES.cartao,
        border: `1px solid ${destaque || CORES.borda}`,
        borderRadius: 12,
        padding: "1.1rem 1.3rem",
      }}
    >
      <div style={{ color: CORES.textoFraco, fontSize: 11, fontFamily: "var(--font-mono, monospace)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>
        {titulo}
      </div>
      {children}
    </div>
  );
}

export default function DashboardPage() {
  const [password, setPassword] = useState("");
  const [autenticado, setAutenticado] = useState(false);
  const [erroLogin, setErroLogin] = useState(null);
  const [aLogar, setALogar] = useState(false);
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState(null);

  const buscar = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard");
      if (res.status === 401) {
        setAutenticado(false);
        return;
      }
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
    fetch("/api/dashboard")
      .then((res) => {
        if (res.status === 401) return;
        setAutenticado(true);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!autenticado) return;
    buscar();
    const intervalo = setInterval(buscar, 4000);
    return () => clearInterval(intervalo);
  }, [autenticado, buscar]);

  const entrar = async (e) => {
    e.preventDefault();
    setALogar(true);
    setErroLogin(null);
    try {
      const res = await fetch("/api/dashboard/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErroLogin(d.error || "Falha no login");
        return;
      }
      setPassword("");
      setAutenticado(true);
    } catch (e) {
      setErroLogin(e.message);
    } finally {
      setALogar(false);
    }
  };

  if (!autenticado) {
    return (
      <main style={{ background: CORES.fundo, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display, system-ui), sans-serif" }}>
        <form
          onSubmit={entrar}
          style={{ background: CORES.cartao, padding: "2rem", borderRadius: 14, border: `1px solid ${CORES.borda}`, width: 320 }}
        >
          <h1 style={{ color: CORES.texto, fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Dashboard — Rede de Agentes</h1>
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoFocus
            style={{ width: "100%", padding: "0.6rem 0.7rem", borderRadius: 8, border: `1px solid ${CORES.borda}`, background: CORES.fundo, color: CORES.texto, marginBottom: 12, fontFamily: "var(--font-mono, monospace)", fontSize: 13 }}
          />
          {erroLogin && (
            <div style={{ color: CORES.vermelho, fontSize: 12, marginBottom: 12 }}>⚠ {erroLogin}</div>
          )}
          <button
            type="submit"
            disabled={aLogar}
            style={{ width: "100%", padding: "0.65rem", borderRadius: 8, border: "none", background: CORES.azul, color: "#06131a", fontWeight: 700, cursor: aLogar ? "default" : "pointer", opacity: aLogar ? 0.7 : 1 }}
          >
            {aLogar ? "A entrar…" : "Entrar"}
          </button>
        </form>
      </main>
    );
  }

  const vmViva = dados?.ultimaTarefaConcluida?.completed_at
    ? Date.now() - new Date(dados.ultimaTarefaConcluida.completed_at).getTime() < 24 * 60 * 60 * 1000
    : null;

  return (
    <main style={{ background: CORES.fundo, minHeight: "100vh", fontFamily: "var(--font-display, system-ui), sans-serif", padding: "1.5rem", color: CORES.texto }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 21, fontWeight: 700, margin: 0, letterSpacing: -0.2 }}>Rede de Agentes LRNSdigital</h1>
          <div style={{ color: CORES.textoFraco, fontSize: 12, fontFamily: "var(--font-mono, monospace)", marginTop: 2 }}>
            {erro ? <span style={{ color: CORES.vermelho }}>⚠ {erro}</span> : `atualizado há ${ultimaAtualizacao ? tempoRelativo(ultimaAtualizacao.toISOString()) : "..."}`}
          </div>
        </div>
        <a
          href="/dashboard/grafo"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "0.55rem 0.9rem",
            borderRadius: 8,
            border: `1px solid ${CORES.bordaForte}`,
            background: CORES.cartaoElevado,
            color: CORES.texto,
            fontSize: 13,
            textDecoration: "none",
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: 999, background: CORES.agente, boxShadow: `0 0 6px ${CORES.agente}` }} />
          Ver constelação da rede →
        </a>
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
                    <span style={{ color: CORES.textoFraco, fontSize: 12, fontFamily: "var(--font-mono, monospace)" }}>
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
              <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "var(--font-mono, monospace)" }}>{dados.metricasNucleoPCU.pct_fast_path}%</div>
              <div style={{ fontSize: 12, color: CORES.textoFraco, marginTop: 4 }}>{dados.metricasNucleoPCU.total_execucoes} execuções no período</div>
            </Cartao>

            <Cartao titulo="Custo cognitivo (30 dias)">
              <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "var(--font-mono, monospace)" }}>{dados.metricasNucleoPCU.custo_total_estimado.toLocaleString("pt-PT")}</div>
              <div style={{ fontSize: 12, color: CORES.textoFraco, marginTop: 4 }}>unidades estimadas</div>
            </Cartao>

            <Cartao titulo="Full Cycle sem justificação">
              <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "var(--font-mono, monospace)", color: dados.metricasNucleoPCU.full_cycle_sem_justificativa > 0 ? CORES.vermelho : CORES.verde }}>
                {dados.metricasNucleoPCU.full_cycle_sem_justificativa}
              </div>
              <div style={{ fontSize: 12, color: CORES.textoFraco, marginTop: 4 }}>deve ser sempre 0 (Constituição PCU)</div>
            </Cartao>

            <Cartao titulo="Cobertura de conhecimento">
              <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "var(--font-mono, monospace)" }}>
                {dados.cobertura.agentesComConteudo}/{dados.cobertura.totalAgentes}
              </div>
              <div style={{ fontSize: 12, color: CORES.textoFraco, marginTop: 4 }}>{dados.cobertura.agentesVazios} agentes ainda vazios</div>
            </Cartao>

            <Cartao titulo="Pendências em aberto">
              <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "var(--font-mono, monospace)" }}>{dados.pendenciasAbertas}</div>
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
                      padding: "7px 0",
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
                        <span style={{ color: CORES.textoFraco, fontFamily: "var(--font-mono, monospace)", fontSize: 11 }}>
                          ({a.fast_path ? "fast-path" : "full-cycle"} · {a.origem})
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: CORES.textoFraco, marginTop: 1 }}>{a.summary}</div>
                    </div>
                    <span style={{ fontSize: 11, color: CORES.textoFraco, whiteSpace: "nowrap", fontFamily: "var(--font-mono, monospace)" }}>{tempoRelativo(a.created_at)}</span>
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
