# RAG + grounding (produção)

## Problema diagnosticado (2026-09-12)

1. **Ingestão grava, agente não usa a fonte certa**
   - `ingest_knowledge` → `knowledge_chunks`
   - `radar-ferramentas` lê **só** `tool_evaluations` injectada em tempo real
   - Corrigir RAG **não** muda respostas do radar sobre tools

2. **Recuperação frágil** — topK baixo; chunks antigos não apagados ao reingerir

3. **Alucinação** — modelo completava licenças/papéis de memória de treino

## Mitigações no código

| Mudança | Onde |
|---------|------|
| `GROUNDING_DIRECTIVE` em todos os agents | `app/api/mcp/route.js` |
| Bloco explícito quando RAG vazio | `runAgent` |
| radar: texto “única fonte = tool_evaluations” | `runAgent` |
| `topK=8` + fallback `global` | `lib/knowledge.js` `retrieveContext` |
| `ingestDocument` replace por (agent_id, source) | `lib/knowledge.js` |

## Onde registar o quê

| Tipo de facto | Tabela / mecanismo |
|---------------|-------------------|
| Status/avaliação de ferramenta | `tool_evaluations` |
| Skills, normas, docs longos | `knowledge_chunks` via ingest |
| Conhecimento transversal | `agent_id = global` |

## SQL diagnóstico (Supabase)

```sql
select agent_id, source, count(*) from knowledge_chunks group by 1, 2 order by 3 desc;
select nome, status, left(resumo, 80) from tool_evaluations order by updated_at desc nulls last limit 50;
```

## Regra de produto

> Se o contexto recuperado não contiver o dado, diz que não tens — **nunca** completes de memória.
