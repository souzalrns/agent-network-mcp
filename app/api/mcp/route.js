import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { AGENTS } from "../../../lib/agents.js";
import { getProjectState, logAction } from "../../../lib/memory.js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.AGENT_MODEL || "claude-haiku-4-5-20251001";
const AGENT_MODEL = process.env.AGENT_EXEC_MODEL || "claude-sonnet-5";

async function routeRequest(userRequest) {
  const agentList = Object.values(AGENTS)
    .map((a) => `- ${a.id}: ${a.description}`)
    .join("\n");

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 200,
    system:
      "És o router de um sistema multiagente. Classifica o pedido e devolve " +
      'APENAS um JSON: {"agent": "<id>", "reason": "<justificação curta>"}. ' +
      'Se nenhum agente servir, devolve {"agent": null, "reason": "..."}.',
    messages: [
      {
        role: "user",
        content: `Agentes disponíveis:\n${agentList}\n\nPedido:\n"${userRequest}"`,
      },
    ],
  });

  const raw = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  try {
    return JSON.parse(raw);
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

  const response = await anthropic.messages.create({
    model: AGENT_MODEL,
    max_tokens: 1500,
    system: `${agent.systemPrompt}\n\nEstado atual conhecido do projeto:\n${stateSummary}`,
    messages: [{ role: "user", content: userRequest }],
  });

  const summary = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");

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
