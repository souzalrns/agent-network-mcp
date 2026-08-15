"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { CORES, tempoRelativo } from "./_lib/tema.js";

function Cartao({ titulo, children, destaque, style }) {
  return (
    <div
      style={{
        background: CORES.cartao,
        border: `1px solid ${destaque || CORES.borda}`,
        borderRadius: 12,
        padding: "1.1rem 1.3rem",
        ...style,
      }}
    >
      <div style={{ color: CORES.textoFraco, fontSize: 11, fontFamily: "var(--font-mono, monospace)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>
        {titulo}
      </div>
      {children}
    </div>
  );
}

const COR_PRIORIDADE = { alta: CORES.vermelho, media: CORES.amarelo, baixa: CORES.textoFraco };
const COR_TIPO = { decisao: CORES.vermelho, autorizacao: CORES.verde, bloqueio_externo: CORES.amarelo, acao: CORES.azul, info: CORES.textoFraco };

function Etiqueta({ cor, children }) {
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 10,
        fontFamily: "var(--font-mono, monospace)",
        textTransform: "uppercase",
        letterSpacing: 0.4,
        color: cor,
        border: `1px solid ${cor}55`,
        borderRadius: 4,
        padding: "1px 6px",
      }}
    >
      {children}
    </span>
  );
}

function LinhaPendencia({ p }) {
  const idadeDias = Math.floor((Date.now() - new Date(p.created_at).getTime()) / 86400000);
  return (
    <div style={{ borderTop: `1px solid ${CORES.borda}`, padding: "9px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
        <div style={{ fontSize: 13 }}>{p.titulo}</div>
        <span style={{ fontSize: 11, color: CORES.textoFraco, fontFamily: "var(--font-mono, monospace)", whiteSpace: "nowrap" }}>
          {idadeDias}d
        </span>
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 5, flexWrap: "wrap" }}>
        <Etiqueta cor={COR_PRIORIDADE[p.prioridade] || CORES.textoFraco}>{p.prioridade}</Etiqueta>
        <Etiqueta cor={CORES.textoFraco}>{p.area_label}</Etiqueta>
        {p.tipo && <Etiqueta cor={COR_TIPO[p.tipo] || CORES.azul}>{p.tipo.replace("_", " ")}</Etiqueta>}
        {p.bloqueado_por && <Etiqueta cor={CORES.vermelho}>bloqueada: {p.bloqueado_por}</Etiqueta>}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [password, setPassword] = useState("");
  const [autenticado, setAutenticado] = useState(false);
  const [erroLogin, setErroLogin] = useState(null);
  const [aLogar, setALogar] = useState(false);
  const [dados, setDados] = useState(null);
  const [cockpit, setCockpit] = useState(null);
  const [erro, setErro] = useState(null);
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState(null);
  const [areaSelecionada, setAreaSelecionada] = useState(null);

  const buscar = useCallback(async () => {
    try {
      const [resDash, resCockpit] = await Promise.all([
        fetch("/api/dashboard"),
        fetch("/api/dashboard/cockpit"),
      ]);
      if (resDash.status === 401 || resCockpit.status === 401) {
        setAutenticado(false);
        return;
      }
      if (!resDash.ok || !resCockpit.ok) {
        setErro(`Erro ${resDash.status}/${resCockpit.status}`);
        return;
      }
      setDados(await resDash.json());
      setCockpit(await resCockpit.json());
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
    const intervalo = setInterval(buscar, 6000);
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

  const filaIntervencaoFiltrada = useMemo(() => {
    if (!cockpit) return [];
    return areaSelecionada ? cockpit.filaIntervencao.filter((p) => p.area_slug === areaSelecionada) : cockpit.filaIntervencao;
  }, [cockpit, areaSelecionada]);

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
          {erroLogin && <div style={{ color: CORES.vermelho, fontSize: 12, marginBottom: 12 }}>⚠ {erroLogin}</div>}
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
    <main style={{ background: CORES.fundo, minHeight: "100vh", fontFamily: "var(--font-display, system-ui), sans-serif", color: CORES.texto, display: "flex" }}>
      {/* Sidebar de áreas */}
      <aside style={{ width: 220, flexShrink: 0, borderRight: `1px solid ${CORES.borda}`, padding: "1.25rem 1rem", minHeight: "100vh" }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 2 }}>LRNSdigital</div>
        <div style={{ fontSize: 11, color: CORES.textoFraco, fontFamily: "var(--font-mono, monospace)", marginBottom: 18 }}>cockpit operacional</div>

        <a
          href="/dashboard/grafo"
          style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: CORES.textoFraco, textDecoration: "none", marginBottom: 18 }}
        >
          <span style={{ width: 6, height: 6, borderRadius: 999, background: CORES.agente, boxShadow: `0 0 6px ${CORES.agente}` }} />
          constelação da rede →
        </a>

        <div style={{ fontSize: 11, color: CORES.textoFraco, textTransform: "uppercase", letterSpacing: 0.6, fontFamily: "var(--font-mono, monospace)", marginBottom: 8 }}>
          áreas
        </div>
        <button
          onClick={() => setAreaSelecionada(null)}
          style={{
            display: "block", width: "100%", textAlign: "left", background: "transparent",
            borderTop: "none", borderRight: "none", borderBottom: "none",
            borderLeft: areaSelecionada === null ? `2px solid ${CORES.agente}` : "2px solid transparent",
            color: areaSelecionada === null ? CORES.texto : CORES.textoFraco,
            fontSize: 12.5, padding: "5px 8px", cursor: "pointer", marginBottom: 1,
          }}
        >
          Todas {cockpit && <span style={{ color: CORES.textoFraco, fontFamily: "var(--font-mono, monospace)" }}>({cockpit.filaIntervencao.length})</span>}
        </button>
        {cockpit?.areas.map((a) => (
          <button
            key={a.slug}
            onClick={() => setAreaSelecionada(a.slug)}
            style={{
              display: "flex", justifyContent: "space-between", width: "100%", textAlign: "left",
              background: "transparent",
              borderTop: "none", borderRight: "none", borderBottom: "none",
              borderLeft: areaSelecionada === a.slug ? `2px solid ${CORES.agente}` : "2px solid transparent",
              color: areaSelecionada === a.slug ? CORES.texto : CORES.textoFraco,
              fontSize: 12.5, padding: "5px 8px", cursor: "pointer", marginBottom: 1,
            }}
          >
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.label}</span>
            <span style={{ color: CORES.textoFraco, fontFamily: "var(--font-mono, monospace)", fontSize: 11, flexShrink: 0, marginLeft: 6 }}>{a.total}</span>
          </button>
        ))}
      </aside>

      {/* Main */}
      <div style={{ flex: 1, padding: "1.5rem", minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, letterSpacing: -0.2 }}>Visão geral</h1>
          <div style={{ color: CORES.textoFraco, fontSize: 12, fontFamily: "var(--font-mono, monospace)" }}>
            {erro ? <span style={{ color: CORES.vermelho }}>⚠ {erro}</span> : `atualizado há ${ultimaAtualizacao ? tempoRelativo(ultimaAtualizacao.toISOString()) : "..."}`}
          </div>
        </div>

        {dados && cockpit && (
          <>
            {/* KPIs */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 12 }}>
              <Cartao titulo="Estado da VM">
                <div style={{ fontSize: 18, fontWeight: 700, color: vmViva ? CORES.verde : CORES.vermelho }}>
                  {vmViva === null ? "—" : vmViva ? "● Ativa" : "○ Sem sinal"}
                </div>
              </Cartao>
              <Cartao titulo="Fast-path (30d)">
                <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "var(--font-mono, monospace)" }}>{dados.metricasNucleoPCU.pct_fast_path}%</div>
              </Cartao>
              <Cartao titulo="Custo cognitivo (30d)">
                <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "var(--font-mono, monospace)" }}>{dados.metricasNucleoPCU.custo_total_estimado.toLocaleString("pt-PT")}</div>
              </Cartao>
              <Cartao titulo="Cobertura RAG">
                <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "var(--font-mono, monospace)" }}>{dados.cobertura.agentesComConteudo}/{dados.cobertura.totalAgentes}</div>
              </Cartao>
              <Cartao titulo="Agentes nunca usados">
                <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "var(--font-mono, monospace)", color: cockpit.agentesNuncaUsados.length > 0 ? CORES.amarelo : CORES.verde }}>
                  {cockpit.agentesNuncaUsados.length}
                </div>
              </Cartao>
              <Cartao titulo="Full-cycle sem justificação">
                <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "var(--font-mono, monospace)", color: dados.metricasNucleoPCU.full_cycle_sem_justificativa > 0 ? CORES.vermelho : CORES.verde }}>
                  {dados.metricasNucleoPCU.full_cycle_sem_justificativa}
                </div>
              </Cartao>
            </div>

            {/* Duas filas */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <Cartao titulo={`Precisa de ti agora (${filaIntervencaoFiltrada.length})`}>
                <div style={{ maxHeight: 340, overflowY: "auto" }}>
                  {filaIntervencaoFiltrada.length === 0 ? (
                    <div style={{ color: CORES.textoFraco, fontSize: 13 }}>Nada nesta área a precisar de ti.</div>
                  ) : (
                    filaIntervencaoFiltrada.slice(0, 25).map((p) => <LinhaPendencia key={p.id} p={p} />)
                  )}
                </div>
              </Cartao>
              <Cartao titulo={`Pode correr sozinho (${cockpit.filaAutonoma.length})`}>
                <div style={{ maxHeight: 340, overflowY: "auto" }}>
                  {cockpit.filaAutonoma.length === 0 ? (
                    <div style={{ color: CORES.textoFraco, fontSize: 13 }}>
                      Ainda nenhuma pendência classificada como autónoma — <code style={{ fontFamily: "var(--font-mono, monospace)" }}>requer_intervencao_humana</code> vem a <code>true</code> por omissão.
                    </div>
                  ) : (
                    cockpit.filaAutonoma.slice(0, 25).map((p) => <LinhaPendencia key={p.id} p={p} />)
                  )}
                </div>
              </Cartao>
            </div>

            {/* Análises */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 12 }}>
              <Cartao titulo="Pendências por prioridade">
                {["alta", "media", "baixa"].map((p) => (
                  <div key={p} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0" }}>
                    <Etiqueta cor={COR_PRIORIDADE[p]}>{p}</Etiqueta>
                    <span style={{ fontFamily: "var(--font-mono, monospace)" }}>{cockpit.porPrioridade[p] || 0}</span>
                  </div>
                ))}
              </Cartao>

              <Cartao titulo="Pendências mais antigas">
                {cockpit.maisAntigas.map((p) => (
                  <div key={p.id} style={{ fontSize: 12, padding: "4px 0", display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.titulo}</span>
                    <span style={{ color: CORES.textoFraco, fontFamily: "var(--font-mono, monospace)", flexShrink: 0 }}>{p.idadeDias}d</span>
                  </div>
                ))}
              </Cartao>

              <Cartao titulo="Custo por agente · Tarefas VM">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <div>
                    {cockpit.topCustoAgentes.map((c) => (
                      <div key={c.agente} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0" }}>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.agente}</span>
                        <span style={{ fontFamily: "var(--font-mono, monospace)", flexShrink: 0, marginLeft: 6 }}>{c.custo.toLocaleString("pt-PT")}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ borderLeft: `1px solid ${CORES.borda}`, paddingLeft: 16 }}>
                    {Object.entries(cockpit.codeTasksPorStatus).map(([status, n]) => (
                      <div key={status} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0" }}>
                        <span>{status}</span>
                        <span style={{ fontFamily: "var(--font-mono, monospace)" }}>{n}</span>
                      </div>
                    ))}
                    {Object.keys(cockpit.codeTasksPorStatus).length === 0 && <div style={{ color: CORES.textoFraco, fontSize: 12 }}>sem tarefas</div>}
                  </div>
                </div>
              </Cartao>
            </div>

            {/* Feed de atividade recente */}
            <Cartao titulo={`Atividade recente (últimas ${dados.atividadeRecente.length})`}>
              <div style={{ maxHeight: 380, overflowY: "auto" }}>
                {dados.atividadeRecente.map((a) => (
                  <div key={a.id} style={{ display: "flex", gap: 10, padding: "7px 0", borderTop: `1px solid ${CORES.borda}`, alignItems: "flex-start" }}>
                    <span style={{ color: a.success ? CORES.verde : CORES.vermelho, fontSize: 14, lineHeight: "20px" }}>{a.success ? "✓" : "✕"}</span>
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
          </>
        )}
      </div>
    </main>
  );
}
