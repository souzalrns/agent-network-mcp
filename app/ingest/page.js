"use client";

import { useState } from "react";

export default function IngestPage() {
  const [agentId, setAgentId] = useState("");
  const [source, setSource] = useState("");
  const [text, setText] = useState("");
  const [secret, setSecret] = useState("");
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setStatus(null);
    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-ingest-secret": secret,
        },
        body: JSON.stringify({ agentId, source, text }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus({ ok: false, message: data.error || "Erro desconhecido" });
      } else {
        setStatus({
          ok: true,
          message: `Sucesso: ${data.inserted}/${data.total} pedaços guardados.`,
        });
        setText("");
      }
    } catch (err) {
      setStatus({ ok: false, message: err.message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ fontFamily: "sans-serif", padding: "2rem", maxWidth: 700 }}>
      <h1>Ingestão de Conhecimento</h1>
      <p>
        Cola aqui conteúdo real (texto de uma skill, norma técnica, etc.)
        para ficar disponível ao agente correspondente. É dividido em
        pedaços automaticamente e guardado com embedding vetorial.
      </p>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <label>
          ID do agente (ex: direito-br-pt)
          <input
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            required
            style={{ width: "100%", padding: "0.5rem" }}
          />
        </label>
        <label>
          Fonte (ex: SKILL.md advogado-especialista)
          <input
            value={source}
            onChange={(e) => setSource(e.target.value)}
            required
            style={{ width: "100%", padding: "0.5rem" }}
          />
        </label>
        <label>
          Chave secreta (INGEST_SECRET do Vercel)
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            required
            style={{ width: "100%", padding: "0.5rem" }}
          />
        </label>
        <label>
          Conteúdo completo
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            required
            rows={16}
            style={{ width: "100%", padding: "0.5rem", fontFamily: "monospace" }}
          />
        </label>
        <button type="submit" disabled={loading} style={{ padding: "0.75rem", fontSize: "1rem" }}>
          {loading ? "A processar..." : "Ingerir"}
        </button>
      </form>
      {status && (
        <p style={{ color: status.ok ? "green" : "red", marginTop: "1rem" }}>
          {status.message}
        </p>
      )}
    </main>
  );
}
