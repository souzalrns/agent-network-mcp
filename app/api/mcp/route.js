import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { AGENTS } from "../../../lib/agents.js";
import {
  getProjectState,
  setProjectState,
  logAction,
  getClient,
} from "../../../lib/memory.js";
import { retrieveContext } from "../../../lib/knowledge.js";

// Usamos o Google Gemini em vez da API paga da Anthropic — o tier gratuito
// do Gemini (AI Studio) não exige cartão de crédito e é generoso o
// suficiente para o volume desta rede de agentes. Ver GEMINI_API_KEY no
// .env.example para onde obter a chave.
const GEMINI_MODEL = process.env.AGENT_MODEL || "gemini-flash-lite-latest";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Diretiva partilhada de concisão: tokens de output custam tipicamente 3-10x
// mais que os de input, e nem todos os 24 agentes têm instrução explícita
// sobre isto no seu systemPrompt individual. Fica concatenada sempre da
// mesma forma a cada chamada (ver runAgent), por isso não quebra o prefixo
// estático que o Gemini cacheia — é só mais uma parte fixa desse prefixo.
const CONCISION_DIRECTIVE =
  "\n\nSê direto e conciso: evita preâmbulos, repetição do pedido e " +
  "floreios. Estrutura a resposta só com o que for necessário para o " +
  "pedido em causa.";

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
      // systemInstruction TEM de ser byte-idêntico entre chamadas ao mesmo
      // agente para o implicit caching do Gemini disparar (grátis, até 90%
      // de desconto nos tokens de input em cache hit). Por isso nunca deve
      // conter estado dinâmico (project_state, RAG) — isso vai sempre no
      // "contents" (ver runAgent). Não mexer nesta separação sem motivo forte.
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

  // Observabilidade de cache: cachedContentTokenCount > 0 confirma que o
  // implicit caching do Gemini está mesmo a bater. Sem isto não há como
  // saber se a separação system/contents está a funcionar na prática.
  const usage = data.usageMetadata || {};
  if (usage.promptTokenCount) {
    const cached = usage.cachedContentTokenCount || 0;
    const hitRate = cached
      ? Math.round((cached / usage.promptTokenCount) * 100)
      : 0;
    console.log(
      `[gemini-cache] prompt=${usage.promptTokenCount} cached=${cached} hit=${hitRate}%`
    );
  }

  return text;
}

async function routeRequest(userRequest) {
  const agentList = Object.values(AGENTS)
    .map((a) => `- ${a.id}: ${a.description}`)
    .join("\n");

  // agentList só muda quando um agente é adicionado/removido — por isso
  // fica no systemInstruction (estático, cacheável), e não no user message.
  // É a parte mais "pesada" do prompt do router, por isso é aqui que o
  // implicit caching do Gemini rende mais.
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

/**
 * Extrai, de forma leve e barata (sem nova chamada ao modelo grande),
 * um resumo curto do que foi feito nesta interacção, para persistir em
 * project_state sob a chave "last_interaction". Isto é o que fecha o
 * ciclo: até agora só líamos project_state, nunca escrevíamos nada lá.
 */
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

  // RAG: pesquisa a base de conhecimento real (não texto colado no prompt)
  // antes de responder. Se não houver nada relevante ou a base estiver
  // vazia/indisponível, isto devolve string vazia e o agente responde
  // normalmente com o que já tem no systemPrompt.
  const supabase = getClient();
  const knowledge = await retrieveContext(supabase, agentId, userRequest);

  const knowledgeBlock = knowledge
    ? `\n\nConhecimento relevante recuperado da base de dados (usa isto como fonte primária quando aplicável, e cita a fonte):\n${knowledge}`
    : "";

  // O systemPrompt do agente vai sozinho e sem alterações — é o prefixo
  // estático que o Gemini pode cachear (grátis, implicit caching, até 90%
  // de desconto). Tudo o que muda de chamada para chamada (estado do
  // projeto, RAG, o pedido em si) vai no "contents", que nunca é cacheado
  // mas também é normalmente muito mais pequeno que o systemPrompt.
  const userMessage =
    `Estado atual conhecido do projeto:\n${stateSummary}${knowledgeBlock}` +
    `\n\nPedido:\n${userRequest}`;

  const summary = await callGemini(
    agent.systemPrompt + CONCISION_DIRECTIVE,
    userMessage,
    1500
  );

  await logAction(agentId, agentId, summary.slice(0, 500));

  // Fecha o ciclo de memória: grava automaticamente um snapshot da
  // interacção em project_state, para que a próxima chamada a este
  // agente já veja "last_interaction" no stateSummary acima.
  await setProjectState(
    agentId,
    "last_interaction",
    buildStateSnapshot(userRequest, summary),
    agentId
  );

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

    server.tool(
      "save_project_state",
      "Grava explicitamente um valor persistente no estado de um projeto " +
        "(project_state), associado a uma chave. Útil para guardar decisões, " +
        "pendências ou factos que devem estar disponíveis em conversas " +
        "futuras com esse agente, além do snapshot automático de cada " +
        "interação.",
      {
        agent: z
          .enum(Object.keys(AGENTS))
          .describe("ID do agente/projeto a que este estado pertence."),
        key: z
          .string()
          .describe("Chave curta e descritiva (ex: 'pendencias', 'decisao_marca')."),
        value: z
          .string()
          .describe("O valor a guardar, em texto livre ou JSON serializado."),
      },
      async ({ agent, key, value }) => {
        let parsed;
        try {
          parsed = JSON.parse(value);
        } catch {
          parsed = value;
        }
        const result = await setProjectState(agent, key, parsed, agent);
        return {
          content: [
            {
              type: "text",
              text: result.ok
                ? `Estado guardado: ${agent}.${key}`
                : `Falha ao guardar estado: ${result.reason}`,
            },
          ],
        };
      }
    );
  },
  {},
  { basePath: "/api" }
);

export { handler as GET, handler as POST };
