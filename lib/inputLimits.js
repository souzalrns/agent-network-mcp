// S-001 (checklist de segurança #14, decisão P-4 = B): tecto de tamanho de cada
// campo de texto das tools MCP (app/api/mcp/route.js). O `.strict()` (S12/A14)
// já recusa chaves desconhecidas; faltava limitar o tamanho, que sem tecto deixa
// um cliente mandar texto arbitrariamente grande (custo de LLM/embeddings, LLM06).
//
// Valores com folga sobre o uso real (2026-10-03): o maior ficheiro de
// ingestion/ tem ~40 KB, por isso `text` aceita 200 000 caracteres (5x). A chave é
// o nome do campo no schema; o teste tests/inputLimits.test.mjs exige que todas
// as strings de input tenham `.max()`.
export const INPUT_LIMITS = Object.freeze({
  request: 20_000, // ask_agent_network, run_specific_agent
  key: 200, // save_project_state
  value: 100_000, // save_project_state
  source: 300, // ingest_knowledge
  text: 200_000, // ingest_knowledge (maior real: ~40 KB)
  kb: 100, // retrieve_knowledge, ingest_knowledge
  query: 4_000, // retrieve_knowledge
  prompt: 20_000, // dispatch_code_task
  project_path: 500, // dispatch_code_task
  allowed_tools: 2_000, // dispatch_code_task
  id: 100, // check_code_task
  agent: 100, // log_execution
  demanda_resumo: 2_000, // log_execution
  capacidade_id: 200, // log_execution (cada item)
  capacidade_id_items: 50, // log_execution (n.º de itens)
  justificativa_full_cycle: 4_000, // log_execution
});
