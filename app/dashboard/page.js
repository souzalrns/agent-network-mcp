"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { CORES, tempoRelativo } from "./_lib/tema.js";
import estilos from "./dashboard.module.css";

function Cartao({ titulo, children, style }) {
  return (
    <div
      style={{
        background: "rgba(17, 20, 29, 0.6)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        borderRadius: 12,
        padding: "0.9rem 1rem",
        minWidth: 0,
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

function GraficoHero({ serie }) {
  const ref = useRef(null);
  const [comprimento, setComprimento] = useState(0);
  const [revelado, setRevelado] = useState(false);

  const largura = 400;
  const altura = 130;
  const pontosValidos = serie.map((p, i) => ({ ...p, x: (i / (serie.length - 1)) * largura })).filter((p) => p.pct !== null);
  const maxPct = Math.max(10, ...pontosValidos.map((p) => p.pct));
  const y = (pct) => altura - (pct / maxPct) * (altura - 8) - 4;
  const linha = pontosValidos.map((p) => `${p.x},${y(p.pct)}`).join(" ");
  const area = pontosValidos.length >= 2 ? `${pontosValidos[0].x},${altura} ${linha} ${pontosValidos[pontosValidos.length - 1].x},${altura}` : "";

  useEffect(() => {
    if (ref.current && pontosValidos.length >= 2) {
      const l = ref.current.getTotalLength();
      setComprimento(l);
      setRevelado(false);
      requestAnimationFrame(() => requestAnimationFrame(() => setRevelado(true)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serie.length, pontosValidos.length]);

  if (pontosValidos.length < 2) {
    return <div style={{ color: CORES.textoFraco, fontSize: 12, height: 100, display: "flex", alignItems: "center" }}>ainda sem dados suficientes nos últimos 14 dias</div>;
  }

  return (
    <svg viewBox={`0 0 ${largura} ${altura}`} width="100%" height="130" preserveAspectRatio="none" style={{ display: "block" }}>
      <polygon points={area} fill={CORES.agente} opacity="0.12" />
      <polyline
        ref={ref}
        points={linha}
        fill="none"
        stroke={CORES.agente}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        style={{
          strokeDasharray: comprimento || undefined,
          strokeDashoffset: revelado ? 0 : comprimento,
          transition: "stroke-dashoffset 1.2s cubic-bezier(0.16,1,0.3,1)",
        }}
      />
    </svg>
  );
}

function AcaoCard({ p }) {
  const [aberto, setAberto] = useState(false);
  const idadeDias = Math.floor((Date.now() - new Date(p.created_at).getTime()) / 86400000);
  const cor = COR_PRIORIDADE[p.prioridade] || CORES.textoFraco;
  return (
    <div className={estilos.acaoCard}>
      <div className={estilos.acaoBarra} style={{ background: cor }} />
      <div className={estilos.acaoCorpo} onClick={() => setAberto((a) => !a)}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
          <span className={estilos.acaoTitulo}>{p.titulo}</span>
          <span className={estilos.acaoMeta}>{idadeDias}d</span>
        </div>
        {aberto && (
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            <Etiqueta cor={cor}>{p.prioridade}</Etiqueta>
            <Etiqueta cor={CORES.textoFraco}>{p.area_label}</Etiqueta>
            {p.tipo && <Etiqueta cor={COR_TIPO[p.tipo] || CORES.azul}>{p.tipo.replace("_", " ")}</Etiqueta>}
            {p.bloqueado_por && <Etiqueta cor={CORES.vermelho}>bloqueada: {p.bloqueado_por}</Etiqueta>}
          </div>
        )}
      </div>
    </div>
  );
}

function RadarAgentes({ agentes }) {
  const tamanho = 200;
  const centro = tamanho / 2;
  const raioMax = 78;
  const maxExec = Math.max(1, ...agentes.map((a) => a.execucoes));

  if (agentes.length === 0) {
    return <div style={{ color: CORES.textoFraco, fontSize: 12, height: tamanho, display: "flex", alignItems: "center", justifyContent: "center" }}>sem execuções registadas</div>;
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
      <svg width={tamanho} height={tamanho} viewBox={`0 0 ${tamanho} ${tamanho}`} style={{ flexShrink: 0 }}>
        {[0.33, 0.66, 1].map((f) => (
          <circle key={f} cx={centro} cy={centro} r={raioMax * f} fill="none" stroke={CORES.borda} strokeWidth="1" />
        ))}
        <line x1={centro - raioMax} y1={centro} x2={centro + raioMax} y2={centro} stroke={CORES.borda} strokeWidth="1" />
        <line x1={centro} y1={centro - raioMax} x2={centro} y2={centro + raioMax} stroke={CORES.borda} strokeWidth="1" />
        {agentes.map((a, i) => {
          const angulo = (i / agentes.length) * 2 * Math.PI - Math.PI / 2;
          const dist = 22 + (a.execucoes / maxExec) * (raioMax - 22);
          const x = centro + dist * Math.cos(angulo);
          const y = centro + dist * Math.sin(angulo);
          const raioNo = 3 + (a.execucoes / maxExec) * 6;
          return (
            <g key={a.agente}>
              <circle cx={x} cy={y} r={raioNo + 4} fill={CORES.agente} opacity="0.15" />
              <circle cx={x} cy={y} r={raioNo} fill={CORES.agente} />
            </g>
          );
        })}
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
        {agentes.slice(0, 6).map((a) => (
          <div key={a.agente} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12 }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.agente}</span>
            <span style={{ fontFamily: "var(--font-mono, monospace)", color: CORES.textoFraco, flexShrink: 0 }}>{a.execucoes}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DonutCobertura({ coberto, total }) {
  const pct = total > 0 ? Math.round((coberto / total) * 100) : 0;
  const raio = 34;
  const circ = 2 * Math.PI * raio;
  const preenchido = (pct / 100) * circ;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
      <svg width="84" height="84" viewBox="0 0 84 84">
        <circle cx="42" cy="42" r={raio} fill="none" stroke={CORES.borda} strokeWidth="8" />
        <circle
          cx="42" cy="42" r={raio} fill="none" stroke={CORES.agente} strokeWidth="8"
          strokeDasharray={`${preenchido} ${circ}`} strokeLinecap="round"
          transform="rotate(-90 42 42)"
        />
        <text x="42" y="46" textAnchor="middle" fontSize="17" fontWeight="700" fill={CORES.texto} fontFamily="var(--font-mono, monospace)">{pct}%</text>
      </svg>
      <div style={{ fontSize: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <span style={{ width: 7, height: 7, borderRadius: 999, background: CORES.agente, display: "inline-block" }} />
          coberto <span style={{ fontFamily: "var(--font-mono, monospace)", color: CORES.textoFraco }}>{coberto}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 7, height: 7, borderRadius: 999, background: CORES.borda, display: "inline-block" }} />
          falta <span style={{ fontFamily: "var(--font-mono, monospace)", color: CORES.textoFraco }}>{total - coberto}</span>
        </div>
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

  // Corrige o bug reportado: só a fila de intervenção estava a filtrar por
  // área; a "pode correr sozinho" ficava sempre igual, por isso clicar numa
  // área parecia não fazer nada.
  const filaIntervencaoFiltrada = useMemo(() => {
    if (!cockpit) return [];
    return areaSelecionada ? cockpit.filaIntervencao.filter((p) => p.area_slug === areaSelecionada) : cockpit.filaIntervencao;
  }, [cockpit, areaSelecionada]);

  const filaAutonomaFiltrada = useMemo(() => {
    if (!cockpit) return [];
    return areaSelecionada ? cockpit.filaAutonoma.filter((p) => p.area_slug === areaSelecionada) : cockpit.filaAutonoma;
  }, [cockpit, areaSelecionada]);

  if (!autenticado) {
    return (
      <main style={{ background: CORES.fundo, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display, system-ui), sans-serif", padding: "1rem" }}>
        <form
          onSubmit={entrar}
          style={{ background: CORES.cartao, padding: "2rem", borderRadius: 14, border: `1px solid ${CORES.borda}`, width: "100%", maxWidth: 320 }}
        >
          <h1 style={{ color: CORES.texto, fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Dashboard — Rede de Agentes</h1>
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoFocus
            style={{ width: "100%", padding: "0.6rem 0.7rem", borderRadius: 8, border: `1px solid ${CORES.borda}`, background: CORES.fundo, color: CORES.texto, marginBottom: 12, fontFamily: "var(--font-mono, monospace)", fontSize: 13, boxSizing: "border-box" }}
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
    <main
      style={{
        background: `radial-gradient(ellipse 900px 500px at 15% -5%, rgba(34,211,238,0.08), transparent 60%),
                     radial-gradient(ellipse 700px 500px at 90% 20%, rgba(167,139,250,0.06), transparent 55%),
                     ${CORES.fundo}`,
        minHeight: "100vh",
        fontFamily: "var(--font-display, system-ui), sans-serif",
        color: CORES.texto,
      }}
    >
      <div className={estilos.shell}>
        {/* Áreas: coluna vertical em ecrãs largos, faixa horizontal de chips em mobile — nada fica escondido atrás de um clique extra */}
        <aside className={estilos.sidebar}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 2 }}>LRNSdigital</div>
          <div style={{ fontSize: 11, color: CORES.textoFraco, fontFamily: "var(--font-mono, monospace)", marginBottom: 14 }}>cockpit operacional</div>

          <a
            href="/dashboard/grafo"
            style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: CORES.textoFraco, textDecoration: "none", marginBottom: 14 }}
          >
            <span style={{ width: 6, height: 6, borderRadius: 999, background: CORES.agente, boxShadow: `0 0 6px ${CORES.agente}` }} />
            constelação da rede →
          </a>

          <div style={{ fontSize: 11, color: CORES.textoFraco, textTransform: "uppercase", letterSpacing: 0.6, fontFamily: "var(--font-mono, monospace)", marginBottom: 8 }}>
            áreas
          </div>
          <div className={estilos.areasLista}>
            <button
              onClick={() => setAreaSelecionada(null)}
              className={`${estilos.areaItem} ${areaSelecionada === null ? estilos.ativo : ""}`}
            >
              Todas {cockpit && <span style={{ fontFamily: "var(--font-mono, monospace)" }}>({cockpit.filaIntervencao.length + cockpit.filaAutonoma.length})</span>}
            </button>
            {cockpit?.areas.map((a) => (
              <button
                key={a.slug}
                onClick={() => setAreaSelecionada(a.slug)}
                className={`${estilos.areaItem} ${areaSelecionada === a.slug ? estilos.ativo : ""}`}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{a.label}</span>
                <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 11, flexShrink: 0, marginLeft: 6 }}>{a.total}</span>
              </button>
            ))}
          </div>
        </aside>

        {/* Main */}
        <div className={estilos.main}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, letterSpacing: -0.2 }}>Visão geral</h1>
            <div style={{ color: CORES.textoFraco, fontSize: 12, fontFamily: "var(--font-mono, monospace)" }}>
              {erro ? <span style={{ color: CORES.vermelho }}>⚠ {erro}</span> : `atualizado há ${ultimaAtualizacao ? tempoRelativo(ultimaAtualizacao.toISOString()) : "..."}`}
            </div>
          </div>

          {dados && cockpit && (
            <>
              {/* Hero: o número que mais importa, o gráfico real, e o radar dos nossos agentes reais */}
              <div className={estilos.heroGrid}>
                <div className={estilos.hero}>
                  <div className={estilos.heroLabel}>fast-path · últimos 30 dias</div>
                  <div className={estilos.heroNumero}>{dados.metricasNucleoPCU.pct_fast_path}%</div>
                  <div className={estilos.heroSub}>{dados.metricasNucleoPCU.total_execucoes} execuções no período</div>
                  <div style={{ marginTop: 14 }}>
                    <GraficoHero serie={dados.serieFastPath} />
                  </div>
                </div>
                <div className={estilos.hero}>
                  <div className={estilos.heroLabel}>rede de agentes · mais ativos</div>
                  <div style={{ marginTop: 10 }}>
                    <RadarAgentes agentes={cockpit.topAgentesAtivos} />
                  </div>
                </div>
              </div>

              {/* Ticker: métricas secundárias, escaneáveis num relance */}
              <div className={estilos.ticker}>
                <div className={estilos.tickerItem}>
                  <div className={estilos.tickerLabel}>estado da vm</div>
                  <div className={estilos.tickerValor} style={{ color: vmViva ? CORES.verde : CORES.vermelho }}>
                    {vmViva === null ? "—" : vmViva ? "● ativa" : "○ sem sinal"}
                  </div>
                </div>
                <div className={estilos.tickerItem}>
                  <div className={estilos.tickerLabel}>custo cognitivo (30d)</div>
                  <div className={estilos.tickerValor}>{dados.metricasNucleoPCU.custo_total_estimado.toLocaleString("pt-PT")}</div>
                </div>
                <div className={estilos.tickerItem}>
                  <div className={estilos.tickerLabel}>agentes nunca usados</div>
                  <div className={estilos.tickerValor} style={{ color: cockpit.agentesNuncaUsados.length > 0 ? CORES.amarelo : CORES.verde }}>
                    {cockpit.agentesNuncaUsados.length}
                  </div>
                </div>
                <div className={estilos.tickerItem}>
                  <div className={estilos.tickerLabel}>full-cycle s/ justificação</div>
                  <div className={estilos.tickerValor} style={{ color: dados.metricasNucleoPCU.full_cycle_sem_justificativa > 0 ? CORES.vermelho : CORES.verde }}>
                    {dados.metricasNucleoPCU.full_cycle_sem_justificativa}
                  </div>
                </div>
                <div className={estilos.tickerItem}>
                  <div className={estilos.tickerLabel}>cobertura rag</div>
                  <DonutCobertura coberto={dados.cobertura.agentesComConteudo} total={dados.cobertura.totalAgentes} />
                </div>
              </div>

              {/* Duas filas — empilhadas em mobile, lado a lado a partir de ~820px */}
              <div className={estilos.filasGrid}>
                <Cartao titulo={`Precisa de ti agora (${filaIntervencaoFiltrada.length})`}>
                  <div style={{ maxHeight: 340, overflowY: "auto" }}>
                    {filaIntervencaoFiltrada.length === 0 ? (
                      <div style={{ color: CORES.textoFraco, fontSize: 13 }}>Nada nesta área a precisar de ti.</div>
                    ) : (
                      filaIntervencaoFiltrada.slice(0, 25).map((p) => <AcaoCard key={p.id} p={p} />)
                    )}
                  </div>
                </Cartao>
                <Cartao titulo={`Pode correr sozinho (${filaAutonomaFiltrada.length})`}>
                  <div style={{ maxHeight: 340, overflowY: "auto" }}>
                    {filaAutonomaFiltrada.length === 0 ? (
                      <div style={{ color: CORES.textoFraco, fontSize: 13 }}>Nada nesta área nesta fila.</div>
                    ) : (
                      filaAutonomaFiltrada.slice(0, 25).map((p) => <AcaoCard key={p.id} p={p} />)
                    )}
                  </div>
                </Cartao>
              </div>

              {/* Análises — 1 coluna em mobile, 2 em tablet, 3 em ecrã largo */}
              <div className={estilos.analisesGrid}>
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
                      <div style={{ flex: 1, minWidth: 0 }}>
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
      </div>
    </main>
  );
}
