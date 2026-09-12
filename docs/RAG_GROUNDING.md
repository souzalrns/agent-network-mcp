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
