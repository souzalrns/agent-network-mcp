"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { CORES, tempoRelativo } from "../_lib/tema.js";

const RAIO = { agente: 9, capacidade: 4.5, fonte: 4.5 };
const COR_NO = { agente: CORES.agente, capacidade: CORES.capacidade, fonte: CORES.fonte };

export default function GrafoPage() {
  const containerRef = useRef(null);
  const graphRef = useRef(null);
  const [estado, setEstado] = useState("a-carregar"); // a-carregar | sem-sessao | erro | pronto
  const [totais, setTotais] = useState(null);
  const [noAtivo, setNoAtivo] = useState(null);

  const carregar = useCallback(async () => {
    const res = await fetch("/api/dashboard/grafo");
    if (res.status === 401) {
      setEstado("sem-sessao");
      return null;
    }
    if (!res.ok) {
      setEstado("erro");
      return null;
    }
    const dados = await res.json();
    setTotais(dados.totais);
    return dados;
  }, []);

  useEffect(() => {
    let destruido = false;
    let instancia = null;

    (async () => {
      const dados = await carregar();
      if (!dados || destruido || !containerRef.current) return;

      const { default: ForceGraph } = await import("force-graph");

      instancia = new ForceGraph(containerRef.current)
        .backgroundColor(CORES.fundoGrafo)
        .graphData({ nodes: dados.nos, links: dados.links })
        .nodeId("id")
        .nodeRelSize(1)
        .nodeVal((n) => (RAIO[n.tipo] || 4) ** 2)
        .nodeColor((n) => COR_NO[n.tipo] || "#888")
        .nodeLabel((n) => n.label)
        .linkColor(() => "rgba(124, 131, 153, 0.25)")
        .linkWidth(0.6)
        .linkDirectionalParticles(1)
        .linkDirectionalParticleWidth(1.2)
        .linkDirectionalParticleColor(() => "rgba(34, 211, 238, 0.55)")
        .linkDirectionalParticleSpeed(0.003)
        .cooldownTicks(120)
        .onNodeClick((n) => setNoAtivo(n))
        .onNodeHover((n) => {
          if (containerRef.current) containerRef.current.style.cursor = n ? "pointer" : "default";
        })
        .nodeCanvasObjectMode(() => "after")
        .nodeCanvasObject((n, ctx, escala) => {
          // brilho suave em torno do nó, mais intenso se houve atividade nas últimas 24h
          const ativo24h = n.ultimaAtividade && Date.now() - new Date(n.ultimaAtividade).getTime() < 24 * 60 * 60 * 1000;
          if (n.tipo !== "agente") return;
          const raio = RAIO[n.tipo];
          const grad = ctx.createRadialGradient(n.x, n.y, raio * 0.5, n.x, n.y, raio * (ativo24h ? 4.5 : 2.5));
          grad.addColorStop(0, ativo24h ? "rgba(34, 211, 238, 0.35)" : "rgba(34, 211, 238, 0.12)");
          grad.addColorStop(1, "rgba(34, 211, 238, 0)");
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(n.x, n.y, raio * (ativo24h ? 4.5 : 2.5), 0, 2 * Math.PI);
          ctx.fill();

          if (escala > 1.1) {
            ctx.font = `${11 / escala}px var(--font-mono, monospace)`;
            ctx.fillStyle = CORES.texto;
            ctx.textAlign = "center";
            ctx.fillText(n.label, n.x, n.y + raio + 11 / escala);
          }
        });

      graphRef.current = instancia;
      setEstado("pronto");

      const ajustar = () => {
        if (!containerRef.current || !instancia) return;
        instancia.width(containerRef.current.clientWidth).height(containerRef.current.clientHeight);
      };
      ajustar();
      window.addEventListener("resize", ajustar);
      instancia.__ajustar = ajustar;
    })();

    return () => {
      destruido = true;
      if (instancia?.__ajustar) window.removeEventListener("resize", instancia.__ajustar);
      if (instancia?._destructor) instancia._destructor();
    };
  }, [carregar]);

  if (estado === "sem-sessao") {
    return (
      <Aviso>
        Sessão expirada. <a href="/dashboard" style={{ color: CORES.azul }}>Entrar de novo</a>
      </Aviso>
    );
  }
  if (estado === "erro") {
    return <Aviso>Não foi possível carregar o grafo. Tenta recarregar a página.</Aviso>;
  }

  return (
    <main
      style={{
        background: CORES.fundoGrafo,
        minHeight: "100vh",
        fontFamily: "var(--font-display, system-ui), sans-serif",
        color: CORES.texto,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 2,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          padding: "1.25rem 1.5rem",
          pointerEvents: "none",
        }}
      >
        <div style={{ pointerEvents: "auto" }}>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.2 }}>Constelação da rede</div>
          <a href="/dashboard" style={{ fontSize: 12, color: CORES.textoFraco, textDecoration: "none" }}>
            ← voltar ao dashboard
          </a>
        </div>
        {totais && (
          <div
            style={{
              pointerEvents: "auto",
              display: "flex",
              gap: 16,
              background: "rgba(17, 20, 29, 0.75)",
              border: `1px solid ${CORES.borda}`,
              borderRadius: 10,
              padding: "0.6rem 1rem",
              fontFamily: "var(--font-mono, monospace)",
              fontSize: 12,
              backdropFilter: "blur(6px)",
            }}
          >
            <Legenda cor={COR_NO.agente} label={`${totais.agentes} agentes`} />
            <Legenda cor={COR_NO.capacidade} label={`${totais.capacidades} capacidades`} />
            <Legenda cor={COR_NO.fonte} label={`${totais.fontes} fontes`} />
          </div>
        )}
      </div>

      {estado === "a-carregar" && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: CORES.textoFraco, fontFamily: "var(--font-mono, monospace)", fontSize: 13 }}>
          a construir constelação…
        </div>
      )}

      <div ref={containerRef} style={{ width: "100%", height: "100vh" }} />

      {noAtivo && (
        <div
          style={{
            position: "absolute",
            bottom: 20,
            left: 20,
            zIndex: 2,
            background: CORES.cartaoElevado,
            border: `1px solid ${CORES.bordaForte}`,
            borderRadius: 10,
            padding: "0.9rem 1.1rem",
            maxWidth: 300,
          }}
        >
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: COR_NO[noAtivo.tipo] }}>
            {noAtivo.tipo}
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>{noAtivo.label}</div>
          <div style={{ fontSize: 12, color: CORES.textoFraco, marginTop: 6, fontFamily: "var(--font-mono, monospace)" }}>
            {noAtivo.tipo === "agente" && (
              <>
                {noAtivo.execucoes7d} execuções (7d)
                {noAtivo.ultimaAtividade && <> · última há {tempoRelativo(noAtivo.ultimaAtividade)}</>}
              </>
            )}
            {noAtivo.tipo === "capacidade" && <>status: {noAtivo.status || "—"}</>}
            {noAtivo.tipo === "fonte" && <>{noAtivo.chunks} chunk(s) de conhecimento</>}
          </div>
          <button
            onClick={() => setNoAtivo(null)}
            style={{ marginTop: 8, background: "none", border: "none", color: CORES.textoFraco, fontSize: 11, cursor: "pointer", padding: 0 }}
          >
            fechar
          </button>
        </div>
      )}
    </main>
  );
}

function Legenda({ cor, label }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 6, color: CORES.textoFraco, whiteSpace: "nowrap" }}>
      <span style={{ width: 8, height: 8, borderRadius: 999, background: cor, display: "inline-block", boxShadow: `0 0 6px ${cor}` }} />
      {label}
    </span>
  );
}

function Aviso({ children }) {
  return (
    <main style={{ background: CORES.fundoGrafo, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: CORES.texto, fontFamily: "system-ui, sans-serif", fontSize: 14 }}>
      {children}
    </main>
  );
}
