import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { AGENTS } from "../../../lib/agents.js";
import {
  getProjectState,
  setProjectState,
  logAgentCall,
  getClient,
  getToolEvaluations,
} from "../../../lib/memory.js";
import { retrieveContext, ingestDocument } from "../../../lib/knowledge.js";

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

  let knowledgeBlock = knowledge
    ? `\n\nConhecimento relevante recuperado da base de dados (usa isto como fonte primária quando aplicável, e cita a fonte):\n${knowledge}`
    : "";

  // radar-ferramentas é especial: em vez de RAG por embeddings (que
  // ficaria desatualizado sempre que uma ferramenta muda de status), lê
  // a tabela tool_evaluations directamente e sempre por inteiro — é
  // pequena, e o agente precisa de ver o quadro completo (pendentes,
  // integradas, rejeitadas) para responder bem.
  if (agentId === "radar-ferramentas") {
    const evaluations = await getToolEvaluations();
    knowledgeBlock = evaluations.length
      ? "\n\nBanco de ferramentas/soluções já avaliadas (tabela tool_evaluations, " +
        `${evaluations.length} entradas, mais recentes primeiro):\n` +
        evaluations
          .map(
            (e) =>
              `- ${e.nome} [${e.status}] (fonte: ${e.fonte || "?"})\n` +
              `  Resumo: ${e.resumo || "-"}\n` +
              (e.bloqueio ? `  Bloqueio: ${e.bloqueio}\n` : "") +
              (e.proximo_passo ? `  Próximo passo: ${e.proximo_passo}\n` : "") +
              (e.descoberto_via ? `  Descoberto via: ${e.descoberto_via}` : "")
          )
          .join("\n\n")
      : "\n\n(Banco de ferramentas ainda vazio.)";
  }

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

        let success = false;
        try {
          const summary = await runAgent(agentId, request);
          success = true;
          return {
            content: [
              {
                type: "text",
                text: `[Agente: ${agentId}]\n\n${summary}`,
              },
            ],
          };
        } finally {
          await logAgentCall({
            agent: agentId,
            summary: request.slice(0, 200),
            success,
            origem: "orquestrador",
          });
        }
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
        let success = false;
        try {
          const summary = await runAgent(agent, request);
          success = true;
          return { content: [{ type: "text", text: summary }] };
        } finally {
          await logAgentCall({
            agent,
            summary: request.slice(0, 200),
            success,
            origem: "chamada_direta",
          });
        }
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
    server.tool(
      "ingest_knowledge",
      "Alimenta a base de conhecimento (RAG) de um agente com conteúdo " +
        "real — divide o texto em pedaços, gera embedding de cada um " +
        "(Gemini) e guarda em knowledge_chunks. Usa isto sempre que houver " +
        "uma skill, norma técnica, ou documento de referência novo para um " +
        "agente consultar em respostas futuras, em vez de colar o texto " +
        "inteiro no systemPrompt dele. Usa agent='global' para conhecimento " +
        "fundamental que deve ficar visível para TODOS os agentes da rede " +
        "(ex: metodologia, princípios da Constituição PCU) — em vez de um " +
        "ID de agente específico.",
      {
        agent: z
          .enum([...Object.keys(AGENTS), "global"])
          .describe(
            "ID do agente a que este conhecimento pertence, ou 'global' " +
              "para conhecimento visível a todos os agentes."
          ),
        source: z
          .string()
          .describe("Nome curto da fonte (ex: 'SKILL.md usucapiao PT-BR')."),
        text: z
          .string()
          .describe("O conteúdo completo a ingerir, em texto livre."),
      },
      async ({ agent, source, text }) => {
        const supabase = getClient();
        if (!supabase) {
          return {
            content: [
              { type: "text", text: "Supabase não configurado — RAG indisponível." },
            ],
          };
        }
        try {
          const result = await ingestDocument(supabase, agent, source, text);
          return {
            content: [
              {
                type: "text",
                text:
                  `Ingerido para '${agent}': ${result.inserted}/${result.total} pedaços guardados` +
                  (result.errors.length ? `. Erros: ${result.errors.join("; ")}` : "."),
              },
            ],
          };
        } catch (err) {
          return {
            content: [{ type: "text", text: `Falha na ingestão: ${err.message}` }],
          };
        }
      }
    );

    server.tool(
      "dispatch_code_task",
      "Envia uma tarefa para ser executada pelo Claude Code na máquina " +
        "local do Luiz (não aqui no chat). A tarefa fica numa fila " +
        "(tabela code_tasks) e um processo a correr na máquina dele " +
        "(bridge-worker.js) apanha-a, corre `claude -p` no diretório do " +
        "projeto indicado, e grava o resultado de volta. Usa " +
        "check_code_task depois para ver o resultado — pode demorar " +
        "minutos, dependendo da tarefa. Nunca uses isto para tarefas " +
        "vagas ou arriscadas; o prompt deve ser específico e autocontido " +
        "(o Claude Code não vai pedir esclarecimentos, corre sem UI).",
      {
        prompt: z
          .string()
          .describe(
            "Instrução completa e específica para o Claude Code executar. " +
              "Deve ser autocontida — não há follow-up interativo."
          ),
        project_path: z
          .string()
          .describe(
            "Caminho absoluto do projeto na máquina do Luiz onde a tarefa " +
              "deve correr (ex: /Users/luiz/projects/mesaflow-api)."
          ),
        allowed_tools: z
          .string()
          .optional()
          .describe(
            "Lista de tools permitidas ao Claude Code, separadas por " +
              "vírgula (ex: 'Bash,Read,Write,Edit'). Por omissão: " +
              "'Bash,Read,Write,Edit,Grep,Glob'. Mantém restrito ao " +
              "necessário — nunca uses isto para dar acesso irrestrito."
          ),
      },
      async ({ prompt, project_path, allowed_tools }) => {
        const supabase = getClient();
        if (!supabase) {
          return {
            content: [
              { type: "text", text: "Supabase não configurado — não é possível despachar a tarefa." },
            ],
          };
        }
        const row = {
          prompt,
          project_path,
          status: "pending",
        };
        if (allowed_tools) row.allowed_tools = allowed_tools;

        const { data, error } = await supabase
          .from("code_tasks")
          .insert(row)
          .select("id")
          .single();

        if (error) {
          return {
            content: [{ type: "text", text: `Falha ao criar a tarefa: ${error.message}` }],
          };
        }

        return {
          content: [
            {
              type: "text",
              text:
                `Tarefa criada (id: ${data.id}). Vai ser executada assim que o ` +
                `bridge-worker.js na máquina do Luiz a apanhar (worker tem de ` +
                `estar a correr). Usa check_code_task com este id para ver o ` +
                `resultado quando estiver pronto.`,
            },
          ],
        };
      }
    );

    server.tool(
      "check_code_task",
      "Verifica o status/resultado de uma tarefa despachada para o " +
        "Claude Code local via dispatch_code_task. Se não passares um id, " +
        "devolve as tarefas mais recentes (pendentes e concluídas).",
      {
        id: z.string().optional().describe("ID da tarefa (devolvido por dispatch_code_task)."),
      },
      async ({ id }) => {
        const supabase = getClient();
        if (!supabase) {
          return { content: [{ type: "text", text: "Supabase não configurado." }] };
        }

        let query = supabase
          .from("code_tasks")
          .select("id, status, prompt, project_path, result, cost_usd, error_message, created_at, completed_at")
          .order("created_at", { ascending: false })
          .limit(10);

        if (id) query = supabase.from("code_tasks").select("*").eq("id", id).single();

        const { data, error } = await query;
        if (error) {
          return { content: [{ type: "text", text: `Erro a consultar: ${error.message}` }] };
        }

        const rows = Array.isArray(data) ? data : [data];
        const text = rows
          .map(
            (t) =>
              `[${t.status}] ${t.id}\n` +
              `  Projeto: ${t.project_path}\n` +
              `  Pedido: ${t.prompt.slice(0, 150)}${t.prompt.length > 150 ? "..." : ""}\n` +
              (t.result ? `  Resultado: ${t.result.slice(0, 1000)}\n` : "") +
              (t.error_message ? `  Erro: ${t.error_message}\n` : "") +
              (t.cost_usd ? `  Custo: $${t.cost_usd}\n` : "")
          )
          .join("\n---\n");

        return { content: [{ type: "text", text: text || "Nenhuma tarefa encontrada." }] };
      }
    );

    server.tool(
      "log_execution",
      "Regista manualmente em agent_log uma execução que o orquestrador " +
        "(Claude, no chat) resolveu diretamente usando uma Capacidade do " +
        "catálogo, sem passar por run_specific_agent nem ask_agent_network. " +
        "Usa isto sempre que resolveres uma demanda dessa forma, para a " +
        "execução não ficar por registar.",
      {
        agent: z
          .string()
          .describe("ID do agente/projeto a que esta execução pertence."),
        demanda_resumo: z
          .string()
          .describe("Resumo curto da demanda resolvida."),
        capacidade_id: z
          .array(z.string())
          .optional()
          .describe("IDs das Capacidades do catálogo usadas nesta execução."),
        fast_path: z
          .boolean()
          .describe("Se a demanda foi resolvida pelo caminho rápido (fast path) ou por ciclo completo."),
        custo_estimado: z
          .number()
          .int()
          .optional()
          .describe("Custo estimado desta execução, na unidade acordada."),
        sucesso: z.boolean().describe("Se a execução foi bem-sucedida."),
        justificativa_full_cycle: z
          .string()
          .optional()
          .describe("Se não usou fast_path, a justificação para o ciclo completo."),
      },
      async ({
        agent,
        demanda_resumo,
        capacidade_id,
        fast_path,
        custo_estimado,
        sucesso,
        justificativa_full_cycle,
      }) => {
        await logAgentCall({
          agent,
          summary: demanda_resumo.slice(0, 200),
          success: sucesso,
          origem: "interno",
          capacidadeId: capacidade_id,
          fastPath: fast_path,
          custoEstimado: custo_estimado,
          justificativaFullCycle: justificativa_full_cycle,
        });
        return {
          content: [
            { type: "text", text: `Execução registada em agent_log para '${agent}'.` },
          ],
        };
      }
    );
  },
  {},
  { basePath: "/api" }
);

export { handler as GET, handler as POST };
