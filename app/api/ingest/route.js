import { getClient } from "../../../lib/memory.js";
import { ingestDocument } from "../../../lib/knowledge.js";

/**
 * Endpoint para alimentar a base de conhecimento (RAG) de um agente com
 * conteúdo real — não é para uso público, é para eu (ou tu) trazerdes
 * documentos reais (skills, normas técnicas, etc.) para dentro da base.
 *
 * Uso:
 * curl -X POST https://<url>/api/ingest \
 *   -H "Content-Type: application/json" \
 *   -H "x-ingest-secret: <INGEST_SECRET>" \
 *   -d '{"agentId": "direito-br-pt", "source": "SKILL.md nome", "text": "conteúdo completo..."}'
 */
export async function POST(req) {
  const secret = req.headers.get("x-ingest-secret");
  if (!process.env.INGEST_SECRET || secret !== process.env.INGEST_SECRET) {
    return Response.json({ error: "Não autorizado" }, { status: 401 });
  }

  const supabase = getClient();
  if (!supabase) {
    return Response.json(
      { error: "Supabase não configurado — memória/RAG indisponível" },
      { status: 500 }
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { agentId, source, text } = body;
  if (!agentId || !source || !text) {
    return Response.json(
      { error: "Campos obrigatórios: agentId, source, text" },
      { status: 400 }
    );
  }

  try {
    const result = await ingestDocument(supabase, agentId, source, text);
    return Response.json(result);
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
