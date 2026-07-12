import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { AGENTS } from "../../../lib/agents.js";
import { getProjectState, logAction, getClient } from "../../../lib/memory.js";
import { retrieveContext } from "../../../lib/knowledge.js";

// Usamos o Google Gemini em vez da API paga da Anthropic — o tier gratuito
// do Gemini (AI Studio) não exige cartão de crédito e é generoso o
// suficiente para o volume desta rede de agentes. Ver GEMINI_API_KEY no
// .env.example para onde obter a chave.
const GEMINI_MODEL = process.env.AGENT_MODEL || "gemini-flash-lite-latest";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

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
      "Nunca uses markdown, blocos de código, nem texto fora do JSON.",
    `Agentes disponíveis:\n${agentList}\n\nPedido:\n"${userRequest}"`,
    200
  );

  const cleaned = raw.trim().replace(/^```json\s*|\s*```$/g, "");

  try {
    return JSON.parse(cleaned);
  } catch {
    return { agent: null, reason: `Resposta não-JSON do router: ${raw}` };
  }
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

  // RAG: pesquisa a base de conhecimento real (não texto colado no prompt)
  // antes de responder. Se não houver nada relevante ou a base estiver
  // vazia/indisponível, isto devolve string vazia e o agente responde
  // normalmente com o que já tem no systemPrompt.
  const supabase = getClient();
  const knowledge = await retrieveContext(supabase, agentId, userRequest);

  const knowledgeBlock = knowledge
    ? `\n\nConhecimento relevante recuperado da base de dados (usa isto como fonte primária quando aplicável, e cita a fonte):\n${knowledge}`
    : "";

  const summary = await callGemini(
    `${agent.systemPrompt}\n\nEstado atual conhecido do projeto:\n${stateSummary}${knowledgeBlock}`,
    userRequest,
    1500
  );

  await logAction(agentId, agentId, summary.slice(0, 500));
  return summary;
}

const handler = createMcpHandler(
  (server) => {
    server.tool(
      "list_agents",
      "Lista os agentes de projeto disponíveis na rede LRNSdigital, com a descrição de cada um.",
      {},
      async () => ({
        content: [
          {
            type: "text",
            text: Object.values(AGENTS)
              .map((a) => `${a.id}: ${a.description}`)
              .join("\n\n"),
          },
        ],
      })
    );

    server.tool(
      "ask_agent_network",
      "Envia um pedido em linguagem natural à rede de agentes LRNSdigital. " +
        "O router decide automaticamente qual agente de projeto (mesaflow, " +
        "viannalegal, etc.) deve responder, com base no contexto fixo de " +
        "cada negócio e na memória persistente do projeto.",
      {
        request: z
          .string()
          .describe("O pedido do utilizador, em linguagem natural."),
      },
      async ({ request }) => {
        const { agent: agentId, reason } = await routeRequest(request);

        if (!agentId || !AGENTS[agentId]) {
          return {
            content: [
              {
                type: "text",
                text: `Nenhum agente claro para este pedido (${reason}). Agentes disponíveis: ${Object.keys(
                  AGENTS
                ).join(", ")}`,
              },
            ],
          };
        }

        const summary = await runAgent(agentId, request);
        return {
          content: [
            {
              type: "text",
              text: `[Agente: ${agentId}]\n\n${summary}`,
            },
          ],
        };
      }
    );

    server.tool(
      "run_specific_agent",
      "Chama diretamente um agente de projeto específico, ignorando o " +
        "router — útil quando já sabes qual projeto queres.",
      {
        agent: z.enum(Object.keys(AGENTS)).describe("ID do agente a chamar."),
        request: z.string().describe("O pedido a enviar a esse agente."),
      },
      async ({ agent, request }) => {
        const summary = await runAgent(agent, request);
        return { content: [{ type: "text", text: summary }] };
      }
    );
  },
  {},
  { basePath: "/api" }
);

export { handler as GET, handler as POST };
