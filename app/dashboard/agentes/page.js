"use client";

import { useState, useEffect, useCallback } from "react";
import { CORES, tempoRelativo } from "../_lib/tema.js";

const CORES_NIVEL = [null, CORES.vermelho, CORES.laranja, CORES.amarelo, CORES.verde, CORES.azul];
const LABEL_NIVEL = [null, "fraca", "razoável", "boa", "forte", "muito forte"];
const TOTAL_SEGMENTOS = 5;

function BarraForca({ nivel, label, cor }) {
  return (
    <div>
      <div style={{ display: "flex", gap: 3 }}>
        {Array.from({ length: TOTAL_SEGMENTOS }).map((_, i) => {
          const ativo = i < nivel;
          const ultimoAtivo = i === nivel - 1;
          return (
            <div
              key={i}
              style={{
                flex: 1,
                height: 4,
                borderRadius: 3,
                background: ativo ? cor : CORES.borda,
                boxShadow: ultimoAtivo ? `0 0 5px ${cor}` : "none",
              }}
            />
          );
        })}
      </div>
      <div style={{ fontSize: 11, color: cor, fontFamily: "var(--font-mono, monospace)", marginTop: 5, fontWeight: 600 }}>
        conhecimento: {label}
      </div>
    </div>
  );
}

function CardAgente({ a }) {
  const cor = CORES_NIVEL[a.classificacao.nivel];
  return (
    <div
      style={{
        background: "rgba(15, 23, 42, 0.7)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        borderRadius: 12,
        padding: "0.9rem 1rem",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 2 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          <span style={{ width: 7, height: 7, borderRadius: 999, background: cor, flexShrink: 0 }} />
          <span style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.nome}</span>
        </div>
        <span style={{ fontSize: 10, fontFamily: "var(--font-mono, monospace)", color: CORES.textoFraco, flexShrink: 0, marginTop: 2 }}>
          {a.chunks} chunk{a.chunks === 1 ? "" : "s"}
        </span>
      </div>
      <div style={{ fontSize: 11, color: CORES.textoFraco, fontFamily: "var(--font-mono, monospace)", marginBottom: 10 }}>
        {a.execucoes30d > 0 ? `${a.execucoes30d} execuções (30d) · última há ${tempoRelativo(a.ultimaAtividade)}` : "sem execuções nos últimos 30 dias"}
      </div>
      <BarraForca nivel={a.classificacao.nivel} label={a.classificacao.label} cor={cor} />
    </div>
  );
}

export default function AgentesPage() {
  const [estado, setEstado] = useState("a-carregar");
  const [dados, setDados] = useState(null);
  const [filtroNivel, setFiltroNivel] = useState(null);

  const carregar = useCallback(async () => {
    const res = await fetch("/api/dashboard/agentes");
    if (res.status === 401) {
      setEstado("sem-sessao");
      return;
    }
    if (!res.ok) {
      setEstado("erro");
      return;
    }
    setDados(await res.json());
    setEstado("pronto");
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (estado === "sem-sessao") {
    return (
      <Aviso>
        Sessão expirada. <a href="/dashboard" style={{ color: CORES.agente }}>Entrar de novo</a>
      </Aviso>
    );
  }
  if (estado === "erro") return <Aviso>Não foi possível carregar os agentes.</Aviso>;

  return (
    <main
      style={{
        background: `radial-gradient(ellipse 900px 500px at 15% -5%, rgba(34,211,238,0.08), transparent 60%), ${CORES.fundo}`,
        minHeight: "100vh",
        fontFamily: "var(--font-display, system-ui), sans-serif",
        color: CORES.texto,
        padding: "1.25rem",
      }}
    >
      <div style={{ marginBottom: 18 }}>
        <a href="/dashboard" style={{ fontSize: 12, color: CORES.textoFraco, textDecoration: "none" }}>← voltar ao dashboard</a>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: "4px 0 2px", letterSpacing: -0.2 }}>Agentes ({dados?.agentes.length ?? "…"})</h1>
        <div style={{ fontSize: 12, color: CORES.textoFraco, fontFamily: "var(--font-mono, monospace)" }}>cobertura de conhecimento por agente</div>
      </div>

      {dados && (
        <>
          <div
            style={{
              display: "flex",
              height: 26,
              borderRadius: 8,
              overflow: "hidden",
              marginBottom: 8,
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            {[1, 2, 3, 4, 5].map((nivel) => {
              const n = dados.resumo[nivel];
              if (n === 0) return null;
              const pct = (n / dados.agentes.length) * 100;
              const ativo = filtroNivel === nivel;
              return (
                <button
                  key={nivel}
                  onClick={() => setFiltroNivel(ativo ? null : nivel)}
                  style={{
                    width: `${pct}%`,
                    background: CORES_NIVEL[nivel],
                    opacity: filtroNivel === null || ativo ? 1 : 0.35,
                    border: "none",
                    cursor: "pointer",
                    color: "#06131a",
                    fontFamily: "var(--font-mono, monospace)",
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                  title={`${LABEL_NIVEL[nivel]}: ${n}`}
                >
                  {pct > 8 ? n : ""}
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16, fontSize: 11, color: CORES.textoFraco, fontFamily: "var(--font-mono, monospace)" }}>
            {[1, 2, 3, 4, 5].map((nivel) => (
              <span key={nivel} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 7, height: 7, borderRadius: 999, background: CORES_NIVEL[nivel] }} />
                {LABEL_NIVEL[nivel]}
              </span>
            ))}
            {filtroNivel && (
              <button onClick={() => setFiltroNivel(null)} style={{ background: "none", border: "none", color: CORES.agente, cursor: "pointer", fontFamily: "var(--font-mono, monospace)", fontSize: 11 }}>
                limpar filtro ✕
              </button>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
            {dados.agentes
              .filter((a) => filtroNivel === null || a.classificacao.nivel === filtroNivel)
              .map((a) => (
                <CardAgente key={a.id} a={a} />
              ))}
          </div>
        </>
      )}
    </main>
  );
}

function Aviso({ children }) {
  return (
    <main style={{ background: CORES.fundo, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: CORES.texto, fontFamily: "system-ui, sans-serif", fontSize: 14 }}>
      {children}
    </main>
  );
}
