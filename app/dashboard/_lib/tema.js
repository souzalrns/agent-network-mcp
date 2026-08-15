// Paleta "constelação cognitiva": fundo quase-preto com undertone azul-marinho,
// nós do grafo em gradiente cyan (agente) → violeta (capacidade) → âmbar (fonte
// de conhecimento), como um mapa de rede neural em vez do escuro-genérico
// com um único acento que a IA produz por defeito.
export const CORES = {
  fundo: "#090b12",
  fundoGrafo: "#070911",
  cartao: "#11141d",
  cartaoElevado: "#161a26",
  borda: "#212637",
  bordaForte: "#323a52",
  texto: "#e9ecf6",
  textoFraco: "#7c8399",
  verde: "#34d399",
  amarelo: "#fbbf24",
  vermelho: "#f87171",
  azul: "#22d3ee",
  agente: "#22d3ee",
  capacidade: "#a78bfa",
  fonte: "#fbbf24",
};

export function tempoRelativo(iso) {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diffMs / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h${m % 60}min`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}
