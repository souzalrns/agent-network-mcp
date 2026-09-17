// RAG: chunks com embedding no Supabase; agentes pesquisam antes de responder.

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const EMBED_MODEL = "gemini-embedding-001";
const EMBED_DIMENSIONS = 768;

/**
 * Gera embedding Gemini.
 * taskType: RETRIEVAL_DOCUMENT | RETRIEVAL_QUERY
 */
export async function embedText(text, taskType = "RETRIEVAL_DOCUMENT") {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY em falta");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: `models/${EMBED_MODEL}`,
      content: { parts: [{ text }] },
      taskType,
      outputDimensionality: EMBED_DIMENSIONS,
    }),
  });

  if (!res.ok) {
    throw new Error(`Erro ao gerar embedding (${res.status}): ${await res.text()}`);
  }
  const data = await res.json();
  return data.embedding.values;
}

/**
 * Chunk por parágrafo com tamanho máximo.
 */
export function chunkText(text, maxChars = 1500) {
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim());
  const chunks = [];
  let current = "";

  for (const paragraph of paragraphs) {
    if (current.length + paragraph.length > maxChars && current) {
      chunks.push(current.trim());
      current = "";
    }
    current += paragraph + "\n\n";
  }
  if (current.trim()) chunks.push(current.trim());
  if (chunks.length === 0 && text.trim()) chunks.push(text.trim());
  return chunks;
}

async function matchOnce(supabase, queryEmbedding, agentId, topK) {
  const { data, error } = await supabase.rpc("match_knowledge", {
    query_embedding: queryEmbedding,
    match_agent_id: agentId,
    match_count: topK,
  });
  if (error) throw error;
  return data || [];
}

function dedupeRank(rows, minSimilarity, topK) {
  const seen = new Set();
  const out = [];
  const sorted = [...rows].sort(
    (a, b) => (Number(b.similarity) || 0) - (Number(a.similarity) || 0)
  );
  for (const row of sorted) {
    const sim = Number(row.similarity);
    if (Number.isFinite(sim) && sim < minSimilarity) continue;
    const key = `${row.agent_id || ""}|${row.source || ""}|${(row.content || "").slice(0, 120)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
    if (out.length >= topK) break;
  }
  return out;
}

/**
 * Pesquisa knowledge_chunks por similaridade.
 * @param {object|number} [opts] — topK number (legacy) ou { topK, alsoGlobal, minSimilarity }
 * @returns {Promise<{ text: string, hitCount: number, error?: string }>}
 */
export async function retrieveContextDetailed(supabase, agentId, query, opts = {}) {
  if (!supabase) return { text: "", hitCount: 0, error: "no_supabase" };
  const topK = typeof opts === "number" ? opts : opts.topK ?? 12;
  const alsoGlobal =
    typeof opts === "object" && opts !== null ? opts.alsoGlobal !== false : true;
  const minSimilarity =
    typeof opts === "object" && opts !== null && opts.minSimilarity != null
      ? Number(opts.minSimilarity)
      : Number(process.env.RAG_MIN_SIMILARITY || 0.22);

  try {
    const queryEmbedding = await embedText(query, "RETRIEVAL_QUERY");
    // Pedir mais do que topK para filtrar por similaridade mínima
    const fetchK = Math.min(Math.max(topK * 2, topK), 24);
    let rows = await matchOnce(supabase, queryEmbedding, agentId, fetchK);

    if (alsoGlobal && agentId !== "global") {
      const globalRows = await matchOnce(supabase, queryEmbedding, "global", fetchK);
      rows = [...(rows || []), ...(globalRows || [])];
    }

    const ranked = dedupeRank(rows || [], minSimilarity, topK);
    if (ranked.length === 0) return { text: "", hitCount: 0 };

    const text = ranked
      .map((row) => {
        const score =
          row.similarity != null
            ? ` sim=${Number(row.similarity).toFixed(3)}`
            : "";
        return `[Fonte: ${row.source} | agent=${row.agent_id || agentId}${score}]\n${row.content}`;
      })
      .join("\n\n---\n\n");

    return { text, hitCount: ranked.length };
  } catch (err) {
    return {
      text: "",
      hitCount: 0,
      error: err?.message || String(err),
    };
  }
}

/**
 * Compat: devolve só a string de contexto (como antes).
 */
export async function retrieveContext(supabase, agentId, query, opts = {}) {
  const { text } = await retrieveContextDetailed(supabase, agentId, query, opts);
  return text;
}

/**
 * Ingere documento. Por omissão APAGA chunks (agent_id, source) antes de inserir.
 */
export async function ingestDocument(supabase, agentId, source, fullText, options = {}) {
  const replace = options.replace !== false;
  const chunks = chunkText(fullText);
  let inserted = 0;
  let deleted = 0;
  const errors = [];

  if (replace) {
    const { error: delErr, count } = await supabase
      .from("knowledge_chunks")
      .delete({ count: "exact" })
      .eq("agent_id", agentId)
      .eq("source", source);
    if (delErr) errors.push(`delete: ${delErr.message}`);
    else deleted = count ?? 0;
  }

  for (const chunk of chunks) {
    try {
      const embedding = await embedText(chunk, "RETRIEVAL_DOCUMENT");
      const { error } = await supabase.from("knowledge_chunks").insert({
        agent_id: agentId,
        source,
        content: chunk,
        embedding,
      });
      if (error) errors.push(error.message);
      else inserted++;
    } catch (err) {
      errors.push(err.message);
    }
  }

  return { total: chunks.length, inserted, deleted, replaced: replace, errors };
}

/**
 * Pesquisa knowledge_chunks e devolve hits ESTRUTURADOS (nao um texto
 * achatado como retrieveContextDetailed). Aditivo -- NAO reescreve
 * retrieveContextDetailed/matchOnce/dedupeRank, so os reutiliza.
 *
 * Limitacoes conhecidas, confirmadas por inspeccao directa do Postgres
 * em 2026-09-17 (ver docs/architecture -- tarefa C8e):
 *   - match_knowledge devolve { id, content, source, similarity } e mais
 *     nada -- nao ha coluna "metadata" em knowledge_chunks, por isso
 *     `metadata` vem sempre null.
 *   - nao existe "locator" (posicao dentro da fonte) em lado nenhum do
 *     schema -- `citation.locator` vem sempre null; so `citation.source`
 *     e real.
 *   - `filters` e aceite no payload (para compatibilidade com o
 *     protocolo KnowledgeBackend do lado Python) mas SEM EFEITO aqui --
 *     matchOnce() so filtra por agent_id/match_count, nada mais.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} query
 * @param {string} kb - mapeado para agent_id (mesma coluna usada pelas outras funcoes)
 * @param {number} [topK=8]
 * @param {{ filters?: Record<string, any>, requireCitations?: boolean, alsoGlobal?: boolean, minSimilarity?: number }} [options]
 * @returns {Promise<Array<{content: string, score: number, doc_id: string, citation: {source: string, locator: null}, metadata: null}>>}
 */
export async function retrieveKnowledgeHits(supabase, query, kb, topK = 8, options = {}) {
  if (!supabase) return [];
  if (!query || !kb) return [];

  const requireCitations = options.requireCitations === true;
  const alsoGlobal = options.alsoGlobal !== false;
  const minSimilarity =
    options.minSimilarity != null
      ? Number(options.minSimilarity)
      : Number(process.env.RAG_MIN_SIMILARITY || 0.22);

  try {
    const queryEmbedding = await embedText(query, "RETRIEVAL_QUERY");
    const fetchK = Math.min(Math.max(topK * 2, topK), 24);

    let rows = await matchOnce(supabase, queryEmbedding, kb, fetchK);
    if (alsoGlobal && kb !== "global") {
      const globalRows = await matchOnce(supabase, queryEmbedding, "global", fetchK);
      rows = [...(rows || []), ...(globalRows || [])];
    }

    const ranked = dedupeRank(rows || [], minSimilarity, topK);

    let hits = ranked.map((row) => ({
      content: row.content,
      score: Number(row.similarity) || 0,
      doc_id: row.id || null,
      citation: {
        source: row.source || null,
        locator: null, // schema actual nao tem esta informacao
      },
      metadata: null, // knowledge_chunks nao tem coluna metadata
    }));

    if (requireCitations) {
      hits = hits.filter((h) => !!h.citation.source);
    }

    return hits;
  } catch (err) {
    // Falha silenciosa e intencional: mesma postura de retrieveContextDetailed
    // (devolve vazio + deixa quem chama decidir, nao lanca excepcao aqui).
    return [];
  }
}
