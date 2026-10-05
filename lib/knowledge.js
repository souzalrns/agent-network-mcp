// RAG: chunks com embedding no Supabase; agentes pesquisam antes de responder.

import { recordTokenUsage } from "./tokenLedger.js";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const EMBED_MODEL = "gemini-embedding-001";
const EMBED_DIMENSIONS = 768;

/**
 * Gera embedding Gemini.
 * taskType: RETRIEVAL_DOCUMENT | RETRIEVAL_QUERY
 * ledger ({ runId, agentId }) só alimenta o token_usage (J6).
 */
export async function embedText(text, taskType = "RETRIEVAL_DOCUMENT", ledger = {}) {
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
  // O embedContent não devolve usageMetadata (confirmado 2026-09-30): a linha
  // fica status='missing_usage', tokens NULL. Síncrono e nunca lança.
  recordTokenUsage(
    {
      runId: ledger.runId,
      agentId: ledger.agentId,
      callKind: taskType === "RETRIEVAL_QUERY" ? "embed_query" : "embed_doc",
      model: EMBED_MODEL,
    },
    null
  );
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

/**
 * F3a (network-agents-setup: ADR-F3-PROVENANCE-RETRIEVE, P-26 = A): com
 * KNOWLEDGE_RPC_V2=1 o retrieve usa a RPC match_knowledge_v2 (proveniencia +
 * filtros). Desligada (omissao), tudo fica como antes: match_knowledge com 3
 * argumentos. So se liga DEPOIS de o DEV correr a migracao
 * network-agents-setup:scripts/migrations/f3_provenance_retrieve.sql; desligar e o
 * rollback (nao precisa de SQL). Lida em cada chamada (testavel, e muda com um
 * redeploy).
 */
export function knowledgeRpcV2Enabled() {
  return process.env.KNOWLEDGE_RPC_V2 === "1";
}

const FILTER_STATUSES = new Set(["active", "superseded", "revoked", "expired", "deleted", "any"]);
const FILTER_TEXT_MAX = 100;

/**
 * Filtros aceites pela match_knowledge_v2, com os valores validados. Chaves fora da
 * lista e valores invalidos sao descartados (nunca chegam ao SQL): o tool
 * retrieve_knowledge aceita `filters` livre (z.record) desde antes do F3a.
 * @returns {{ filters: Record<string, string>, ignored: string[] }}
 */
export function sanitizeKnowledgeFilters(filters) {
  const out = {};
  const ignored = [];
  if (!filters || typeof filters !== "object" || Array.isArray(filters)) {
    return { filters: out, ignored };
  }
  for (const [key, value] of Object.entries(filters)) {
    const text = typeof value === "string" ? value.trim() : "";
    if (key === "status" && FILTER_STATUSES.has(text)) out.status = text;
    else if ((key === "jurisdiction" || key === "document_type") && text && text.length <= FILTER_TEXT_MAX)
      out[key] = text;
    else if (key === "valid_at" && text && !Number.isNaN(Date.parse(text)))
      out.valid_at = new Date(text).toISOString();
    else ignored.push(key);
  }
  return { filters: out, ignored };
}

async function matchOnce(supabase, queryEmbedding, agentId, topK, filters = {}) {
  const v2 = knowledgeRpcV2Enabled();
  const args = {
    query_embedding: queryEmbedding,
    match_agent_id: agentId,
    match_count: topK,
  };
  if (v2) args.filters = filters;
  const { data, error } = await supabase.rpc(v2 ? "match_knowledge_v2" : "match_knowledge", args);
  if (error && v2 && isMissingFunction(error)) {
    // Flag ligada antes da migracao: em vez de um RAG vazio em silencio, avisa e usa
    // a match_knowledge antiga (os hits ficam sem proveniencia, como antes do F3a).
    console.warn(
      "[knowledge] KNOWLEDGE_RPC_V2=1 mas a match_knowledge_v2 nao existe " +
        "(correr scripts/migrations/f3_provenance_retrieve.sql); a usar match_knowledge."
    );
    const old = await supabase.rpc("match_knowledge", {
      query_embedding: queryEmbedding,
      match_agent_id: agentId,
      match_count: topK,
    });
    if (old.error) throw old.error;
    return old.data || [];
  }
  if (error) throw error;
  return data || [];
}

// PostgREST: PGRST202 = funcao nao encontrada no schema cache (a migracao nao correu).
function isMissingFunction(error) {
  return error?.code === "PGRST202" || /match_knowledge_v2/.test(error?.message || "");
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
 * @param {object|number} [opts] — topK number (legacy) ou { topK, alsoGlobal, minSimilarity, runId }
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
  const runId = typeof opts === "object" && opts !== null ? opts.runId : undefined;

  try {
    const queryEmbedding = await embedText(query, "RETRIEVAL_QUERY", { runId, agentId });
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
 * Só apaga linhas do MCP (project NULL): a knowledge_chunks é partilhada com o
 * T6 do network-agents-setup, cujas linhas têm project preenchido (R-004).
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
      .eq("source", source)
      .is("project", null);
    if (delErr) errors.push(`delete: ${delErr.message}`);
    else deleted = count ?? 0;
  }

  for (const chunk of chunks) {
    try {
      const embedding = await embedText(chunk, "RETRIEVAL_DOCUMENT", {
        runId: options.runId,
        agentId,
      });
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
 * Hit com a proveniencia da match_knowledge_v2. Mesmos campos de sempre (content,
 * score, doc_id, citation.source, citation.locator, metadata) mais citation.uri e
 * citation.title; `metadata` deixa de ser null. Nenhum campo antigo muda de nome.
 */
function hitWithProvenance(row) {
  return {
    content: row.content,
    score: Number(row.similarity) || 0,
    doc_id: row.id || null,
    citation: {
      source: row.source || null,
      locator: row.locator || null,
      uri: row.uri || row.source || null,
      title: row.title || null,
    },
    metadata: {
      document_type: row.document_type || null,
      status: row.status || null,
      retrieved_at: row.retrieved_at || null,
      jurisdiction: row.jurisdiction || null,
      effective_from: row.effective_from || null,
      effective_until: row.effective_until || null,
      content_hash: row.content_hash || null,
      final_url: row.final_url || null,
    },
  };
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
 * F3a: com KNOWLEDGE_RPC_V2=1 as 3 limitacoes acima deixam de existir --
 * citation.locator/uri/title e metadata vem da match_knowledge_v2, e os filtros
 * status, jurisdiction, document_type e valid_at tem efeito (sanitizeKnowledgeFilters).
 * Por omissao (sem a flag), o comportamento e o descrito acima.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} query
 * @param {string} kb - mapeado para agent_id (mesma coluna usada pelas outras funcoes)
 * @param {number} [topK=8]
 * @param {{ filters?: Record<string, any>, requireCitations?: boolean, alsoGlobal?: boolean, minSimilarity?: number, runId?: string }} [options]
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
    const queryEmbedding = await embedText(query, "RETRIEVAL_QUERY", {
      runId: options.runId,
      agentId: kb,
    });
    const fetchK = Math.min(Math.max(topK * 2, topK), 24);
    const v2 = knowledgeRpcV2Enabled();
    const { filters } = sanitizeKnowledgeFilters(options.filters);

    let rows = await matchOnce(supabase, queryEmbedding, kb, fetchK, filters);
    if (alsoGlobal && kb !== "global") {
      const globalRows = await matchOnce(supabase, queryEmbedding, "global", fetchK, filters);
      rows = [...(rows || []), ...(globalRows || [])];
    }

    const ranked = dedupeRank(rows || [], minSimilarity, topK);

    let hits = ranked.map((row) => (v2 ? hitWithProvenance(row) : {
      content: row.content,
      score: Number(row.similarity) || 0,
      doc_id: row.id || null,
      citation: {
        source: row.source || null,
        locator: null, // sem KNOWLEDGE_RPC_V2: a match_knowledge nao devolve locator
      },
      metadata: null, // sem KNOWLEDGE_RPC_V2: sem proveniencia
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
