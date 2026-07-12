// RAG (Retrieval-Augmented Generation): em vez de copiar texto para dentro
// dos system prompts, o conteúdo real (skills jurídicas, normas técnicas,
// etc.) fica guardado como "chunks" com embedding vetorial no Supabase.
// Os agentes pesquisam a base em tempo real antes de responder.

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const EMBED_MODEL = "gemini-embedding-001";
const EMBED_DIMENSIONS = 768; // recomendado pela Google — bom equilíbrio qualidade/custo

/**
 * Gera o embedding vetorial de um texto usando o Gemini.
 * taskType: "RETRIEVAL_DOCUMENT" para conteúdo a guardar,
 *           "RETRIEVAL_QUERY" para a pergunta do utilizador.
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
 * Divide um texto longo em pedaços ("chunks") por parágrafo, respeitando
 * um tamanho máximo aproximado. Chunking simples mas eficaz para
 * conteúdo em markdown/tabelas.
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
  return chunks;
}

/**
 * Pesquisa a base de conhecimento por similaridade semântica, filtrada
 * por agente. Devolve os `topK` pedaços mais relevantes para a pergunta,
 * formatados com a fonte de cada um.
 */
export async function retrieveContext(supabase, agentId, query, topK = 4) {
  if (!supabase) return "";
  try {
    const queryEmbedding = await embedText(query, "RETRIEVAL_QUERY");
    const { data, error } = await supabase.rpc("match_knowledge", {
      query_embedding: queryEmbedding,
      match_agent_id: agentId,
      match_count: topK,
    });
    if (error || !data || data.length === 0) return "";

    return data
      .map((row) => `[Fonte: ${row.source}]\n${row.content}`)
      .join("\n\n---\n\n");
  } catch {
    // RAG é um extra — se falhar, o agente continua a responder sem ele
    return "";
  }
}

/**
 * Ingere um documento inteiro: divide em chunks, gera embedding de cada
 * um, e guarda na base de conhecimento associado a um agente.
 */
export async function ingestDocument(supabase, agentId, source, fullText) {
  const chunks = chunkText(fullText);
  let inserted = 0;
  const errors = [];

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

  return { total: chunks.length, inserted, errors };
}
