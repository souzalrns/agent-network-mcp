import { AGENTS } from "./agents.js";
import {
  getProjectState,
  setProjectState,
  getClient,
  getToolEvaluations,
} from "./memory.js";
import { retrieveContextDetailed } from "./knowledge.js";

const GEMINI_MODEL = process.env.AGENT_MODEL || "gemini-flash-lite-latest";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const CONCISION_DIRECTIVE =
  "\n\nSê direto e conciso: evita preâmbulos, repetição do pedido e " +
  "floreios. Estrutura a resposta só com o que for necessário para o " +
  "pedido em causa.";

// Anti-alucinação / grounding: aplica-se a TODOS os agentes.
const GROUNDING_DIRECTIVE =
  "\n\nRegras de evidência (obrigatórias):\n" +
  "1. Factos concretos (licenças, versões, status de tools, papéis de " +
  "arquitectura, números, datas) só a partir do contexto injectado nesta " +
  "mensagem (blocos de conhecimento / banco de ferramentas / estado).\n" +
  "2. Se o contexto recuperado NÃO contiver o dado pedido, diz " +
  "explicitamente que não tens esse dado na base — NUNCA completes de " +
  "memória de treino nem inventes valores plausíveis.\n" +
  "3. Quando usares um facto do contexto, cita a fonte (nome da tool, " +
  "source do chunk, ou tabela).\n" +
  "4. Diferencia: (a) está no contexto; (b) não está no contexto; " +
  "(c) hipótese tua marcada como hipótese.";

async function callGemini(systemPrompt, userMessage, maxTokens = 1500) {
  if (!GEMINI_API_KEY) {
    throw new Error(
      "GEMINI_API_KEY em falta. Cria uma chave gratuita em aistudio.google.com/apikey e adiciona-a nas Environment Variables do Vercel."
    );
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userMessage }] }],
      generationConfig: { maxOutputTokens: maxTokens },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Erro na API Gemini (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const text =
    data.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "";
  return text;
}

async function routeRequest(userRequest) {
  const agentList = Object.values(AGENTS)
    .map((a) => `- ${a.id}: ${a.description}`)
    .join("\n");

  const raw = await callGemini(
    "És o router de um sistema multiagente. Classifica o pedido e devolve " +
      'APENAS um JSON: {"agent": "<id>", "reason": "<justificação curta>"}. ' +
      'Se nenhum agente servir, devolve {"agent": null, "reason": "..."}. ' +
      "Nunca uses markdown, blocos de código, nem texto fora do JSON.\n\n" +
      `Agentes disponíveis:\n${agentList}`,
    `Pedido:\n"${userRequest}"`,
    200
  );

  const cleaned = raw.trim().replace(/^```json\s*|\s*```$/g, "");

  try {
    return JSON.parse(cleaned);
  } catch {
    return { agent: null, reason: `Resposta não-JSON do router: ${raw}` };
  }
}

function buildStateSnapshot(userRequest, summary) {
  return {
    request: userRequest.slice(0, 300),
    summary: summary.slice(0, 500),
    at: new Date().toISOString(),
  };
}

async function runAgent(agentId, userRequest) {
  const agent = AGENTS[agentId];
  if (!agent) throw new Error(`Agente desconhecido: ${agentId}`);

  const state = await getProjectState(agentId);
  const stateSummary = Object.keys(state).length
    ? Object.entries(state)
        .map(([k, v]) => `- ${k}: ${JSON.stringify(v)}`)
        .join("\n")
    : "(sem estado guardado ainda)";

  const supabase = getClient();
  const rag = await retrieveContextDetailed(supabase, agentId, userRequest, {
    topK: 12,
    alsoGlobal: true,
    minSimilarity: Number(process.env.RAG_MIN_SIMILARITY || 0.22),
  });

  const ragEmptyNote =
    `(vazio — 0 chunks acima do limiar de similaridade` +
    (rag.error ? `; erro retrieval: ${rag.error}` : "") +
    `. NÃO inventes factos; diz que não tens o dado na base.)`;

  let knowledgeBlock = rag.text
    ? `\n\n=== CONTEXTO RECUPERADO (knowledge_chunks, ${rag.hitCount} hits) ===\n` +
      `Usa APENAS isto + o estado abaixo para factos documentais. Cita [Fonte: …].\n` +
      `${rag.text}\n=== FIM CONTEXTO RECUPERADO ===`
    : `\n\n=== CONTEXTO RECUPERADO (knowledge_chunks) ===\n${ragEmptyNote}\n=== FIM CONTEXTO RECUPERADO ===`;

  if (agentId === "radar-ferramentas") {
    const evaluations = await getToolEvaluations();
    const bank = evaluations.length
      ? "\n\n=== BANCO tool_evaluations (FONTE DE VERDADE para status/avaliação de tools) ===\n" +
        `${evaluations.length} entradas. Para status, bloqueio, próximo passo e ` +
        `licença/registo operacional, responde SÓ com base nisto. ` +
        `Se não estiver aqui: "não registado no banco tool_evaluations".\n` +
        evaluations
          .map(
            (e) =>
              `- ${e.nome} [${e.status}] (fonte: ${e.fonte || "?"})\n` +
              `  Resumo: ${e.resumo || "-"}\n` +
              (e.bloqueio ? `  Bloqueio: ${e.bloqueio}\n` : "") +
              (e.proximo_passo ? `  Próximo passo: ${e.proximo_passo}\n` : "") +
              (e.descoberto_via ? `  Descoberto via: ${e.descoberto_via}` : "")
          )
          .join("\n\n") +
        "\n=== FIM tool_evaluations ==="
      : "\n\n=== BANCO tool_evaluations VAZIO ===\n" +
        "Não inventes avaliações. Diz que o banco está vazio.\n" +
        "=== FIM ===";

    const ragSupp = rag.text
      ? "\n\n=== SUPLEMENTO knowledge_chunks (NÃO substitui tool_evaluations) ===\n" +
        `Pode informar narrativa/docs ingeridos (${rag.hitCount} hits). ` +
        `Se conflitar com tool_evaluations, prevalece tool_evaluations. ` +
        `Se o facto pedido (ex. licença) só aparecer aqui e não no banco, ` +
        `diz que está no suplemento RAG e cita a fonte — nunca inventes.\n` +
        `${rag.text}\n=== FIM SUPLEMENTO ===`
      : "\n\n=== SUPLEMENTO knowledge_chunks ===\n" +
        "(vazio) Se também não estiver em tool_evaluations → não tens o dado.\n" +
        "=== FIM SUPLEMENTO ===";

    knowledgeBlock = bank + ragSupp;
  }

  const userMessage =
    `Estado atual conhecido do projeto:\n${stateSummary}${knowledgeBlock}` +
    `\n\nPedido:\n${userRequest}`;

  const summary = await callGemini(
    agent.systemPrompt + CONCISION_DIRECTIVE + GROUNDING_DIRECTIVE,
    userMessage,
    1500
  );

  await setProjectState(
    agentId,
    "last_interaction",
    buildStateSnapshot(userRequest, summary),
    agentId
  );

  return summary;
}

export { callGemini, routeRequest, runAgent, buildStateSnapshot };
