# RAG + grounding (produção)

## Problema (2026-09-12)

1. **Duas fontes de verdade**
   - `ingest_knowledge` → `knowledge_chunks`
   - `radar-ferramentas` status → **`tool_evaluations`**
   - Ingerir só em `knowledge_chunks` **não** actualiza o banco do radar

2. **Recuperação** — topK baixo; só fallback global se agent vazio; alucinação quando vazio

3. **Alucinação** — licenças/papéis de memória de treino

## Mitigações (código actual)

| Mudança | Onde |
|---------|------|
| `GROUNDING_DIRECTIVE` em todos | `lib/agentRuntime.js` |
| Merge agent + **global** hits + `minSimilarity` | `lib/knowledge.js` |
| topK 12, fetchK ampliado | `retrieveContextDetailed` |
| Radar: **tool_evaluations** + suplemento RAG | `runAgent` |
| Aviso no `ingest_knowledge` se agent=radar | `app/api/mcp/route.js` |
| Bloco explícito quando RAG vazio | `runAgent` |

## Onde registar o quê

| Tipo de facto | Onde |
|---------------|------|
| Status / bloqueio / próximo passo de tool | `tool_evaluations` |
| Docs, skills, normas, licenças em texto longo | `knowledge_chunks` (`ingest_knowledge`) |
| Transversal | `agent_id = global` |

## SQL diagnóstico

```sql
select agent_id, source, count(*) from knowledge_chunks group by 1, 2 order by 3 desc;
select nome, status, left(resumo, 80) from tool_evaluations order by updated_at desc nulls last limit 50;
```

## Regra de produto

> Se o contexto recuperado não contiver o dado, diz que não tens — **nunca** completes de memória.

Env opcional: `RAG_MIN_SIMILARITY` (default `0.22`).

## Proveniência no retrieve (F3a, opcional)

Env opcional: `KNOWLEDGE_RPC_V2` (por omissão desligada; só liga com `1`).

- **Desligada** (como hoje): o retrieve chama `match_knowledge` com 3 argumentos. Os hits do `retrieve_knowledge` trazem `citation.source`, `citation.locator: null` e `metadata: null`, e os `filters` não têm efeito.
- **Ligada:** o retrieve chama `match_knowledge_v2`.
  - Os hits ganham `citation.locator`, `citation.uri`, `citation.title` e `metadata` (`document_type`, `status`, `retrieved_at`, `jurisdiction`, validade, `content_hash`, `final_url`), sem perder nenhum campo antigo.
  - Os `filters` `status` (`active` por omissão, ou `any`), `jurisdiction`, `document_type` e `valid_at` passam a ter efeito. Chaves e valores inválidos são ignorados (`sanitizeKnowledgeFilters`).
  - O contexto dos agentes também deixa de incluir documentos revogados ou expirados.
- **Ordem:**
  1. o DEV corre a migração `network-agents-setup:scripts/migrations/f3_provenance_retrieve.sql`;
  2. depois põe `KNOWLEDGE_RPC_V2=1` na Vercel (Production) e faz redeploy.
  - Se a flag for ligada antes da migração, o MCP não fica sem RAG: a `match_knowledge_v2` dá `PGRST202` (função não encontrada), aparece um aviso no log (`[knowledge] match_knowledge_v2 nao existe (correr …f3_provenance_retrieve.sql); a usar match_knowledge.`) e a chamada cai para a `match_knowledge` antiga, sem proveniência.
  - **Rollback:** tirar a flag e fazer redeploy (sem SQL).
- O runbook completo está em `network-agents-setup:docs/ops/RAG-CANONICAL.md`, secção F3a.

## Autoridade das fontes (F3b, opcional)

Env opcional: `KNOWLEDGE_RPC_V3` (por omissão desligada; só liga com `1`). Decisões no `network-agents-setup` (PENDENCIAS §10): P-31 = D, P-32 = B, P-33 = B.

- **Ligada:** o retrieve chama `match_knowledge_v3`, que é a v2 com mais 2 coisas:
  - o `metadata` de cada hit ganha `authority` (`oficial` > `curado` > `experimental`; sem autoridade gravada, `curado`) e `superseded_by`;
  - o `filters` aceita `min_authority`.
  - Por omissão a v3 devolve tudo, pela ordem da semelhança, e não precisa da `KNOWLEDGE_RPC_V2`.
- **Desligada:** fica tudo como na secção anterior, e os hits não ganham chaves novas.
- **`min_authority` sem a v3 a responder** (flag desligada, ou v3 por criar) devolve **zero hits**, com aviso no log. Um plano que exige autoridade mínima nunca recebe fontes por verificar.
- **Ordem:**
  1. o DEV corre a migração `network-agents-setup:scripts/migrations/f3b_authority_v3.sql` (antes, a query de controlo no fim do ficheiro);
  2. depois põe `KNOWLEDGE_RPC_V3=1` na Vercel (Production) e faz redeploy.
  - Se a flag for ligada antes do SQL, a chamada cai para a v2, ou para a `match_knowledge` se a v2 também faltar, com aviso no log.
  - **Rollback:** tirar a flag e fazer redeploy (sem SQL).
- O runbook completo está em `network-agents-setup:docs/ops/RAG-CANONICAL.md`, secção «F3b: autoridade e conflitos».
