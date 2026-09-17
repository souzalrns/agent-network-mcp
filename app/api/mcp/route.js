import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { AGENTS } from "../../../lib/agents.js";
import {
  setProjectState,
  logAgentCall,
  getClient,
} from "../../../lib/memory.js";
import { ingestDocument, retrieveKnowledgeHits } from "../../../lib/knowledge.js";
import { routeRequest, runAgent } from "../../../lib/agentRuntime.js";

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
        "(Gemini) e guarda em knowledge_chunks. Substitui chunks anteriores " +
        "com a mesma source para o mesmo agente. NÃO alimenta tool_evaluations " +
        "(radar-ferramentas); para tools usa a tabela tool_evaluations. " +
        "Usa agent='global' para conhecimento visível a todos.",
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
                  `Ingerido para '${agent}' (source=${source}): ` +
                  `${result.inserted}/${result.total} pedaços; ` +
                  `apagados anteriores=${result.deleted ?? 0}` +
                  (result.errors.length ? `. Erros: ${result.errors.join("; ")}` : ".") +
                  (agent === "radar-ferramentas"
                    ? " ATENÇÃO: radar-ferramentas usa tool_evaluations para status; " +
                      "knowledge_chunks é só suplemento. Regista tools na tabela tool_evaluations."
                    : ""),
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
      "retrieve_knowledge",
      "Pesquisa a base de conhecimento (RAG) por similaridade semantica e " +
        "devolve os pedacos mais relevantes, estruturados (nao um texto " +
        "unico). Usa isto para consultar o que ja foi ingerido via " +
        "ingest_knowledge, antes de responder com base em memoria. " +
        "NOTA: nem todos os campos de hit tem dado real hoje -- " +
        "'metadata' vem sempre null (a tabela nao tem essa coluna), e " +
        "'citation.locator' vem sempre null (o schema so guarda a fonte, " +
        "nao a posicao dentro dela).",
      {
        kb: z
          .string()
          .describe(
            "Base de conhecimento a pesquisar -- corresponde ao agent_id " +
              "usado em ingest_knowledge (ou 'global')."
          ),
        query: z.string().describe("A pergunta ou texto a pesquisar."),
        top_k: z
          .number()
          .int()
          .min(1)
          .max(30)
          .optional()
          .describe("Numero maximo de resultados. Por omissao: 8."),
        filters: z
          .record(z.any())
          .optional()
          .describe(
            "Reservado para filtros futuros -- aceite mas SEM EFEITO na " +
              "implementacao actual (matchOnce so filtra por kb)."
          ),
        require_citations: z
          .boolean()
          .optional()
          .describe(
            "Se true, descarta hits sem 'source' identificado. Por " +
              "omissao: false."
          ),
      },
      async ({ kb, query, top_k, filters, require_citations }) => {
        const supabase = getClient();
        if (!supabase) {
          return {
            content: [
              { type: "text", text: "Supabase não configurado — RAG indisponível." },
            ],
          };
        }
        try {
          const hits = await retrieveKnowledgeHits(
            supabase,
            query,
            kb,
            top_k || 8,
            { filters, requireCitations: require_citations === true }
          );
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ hits, hitCount: hits.length }),
              },
            ],
          };
        } catch (err) {
          return {
            content: [
              { type: "text", text: `Falha na pesquisa: ${err.message}` },
            ],
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
          .describe(
            "Se não usou fast path, justificação curta do full cycle."
          ),
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
          summary: demanda_resumo,
          success: sucesso,
          origem: "orquestrador_manual",
          meta: {
            capacidade_id,
            fast_path,
            custo_estimado,
            justificativa_full_cycle,
          },
        });
        return {
          content: [{ type: "text", text: `Execução registada para ${agent}.` }],
        };
      }
    );
  },
  {},
  { basePath: "/api" }
);

const innerHandler = handler;

function unauthorized() {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

function misconfigured() {
  return new Response(
    JSON.stringify({
      error: "Service unavailable: MCP_API_KEY is not configured",
    }),
    { status: 503, headers: { "Content-Type": "application/json" } }
  );
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function withAuth(request) {
  const expected = process.env.MCP_API_KEY;
  if (!expected || expected.length < 16) {
    console.error(
      "MCP_API_KEY ausente ou demasiado curta -- /api/mcp indisponivel (fail-closed)."
    );
    return misconfigured();
  }
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match || !constantTimeEqual(match[1], expected)) {
    return unauthorized();
  }
  return innerHandler(request);
}

export { withAuth as GET, withAuth as POST, withAuth as DELETE };
