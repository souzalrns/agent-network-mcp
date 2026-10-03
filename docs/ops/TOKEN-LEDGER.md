# Ledger de tokens — `token_usage` (J6)

> **Estado (2026-09-30): EM PRODUÇÃO.** Passos 1–3 feitos: tabela criada pelo DEV (RLS ligado, verificado por SELECT read-only) e PR #8 merged (deploy de produção às 20:35 UTC). **Falta o passo 4:** às 20:43 UTC a tabela tinha 0 linhas porque ainda não tinha entrado nenhum pedido no deploy novo (logs do Vercel vazios).

## O que mede

Uma linha em `public.token_usage` por chamada à API Gemini:

| `call_kind` | Chamada | Onde | Tokens |
|---|---|---|---|
| `router` | `generateContent`, escolhe o agente (`agent_id` NULL) | `lib/agentRuntime.js:88` | `usageMetadata` |
| `agent` | `generateContent`, resposta do agente | `lib/agentRuntime.js:182` | `usageMetadata` |
| `embed_query` | `embedContent` da pergunta (RAG) | `lib/knowledge.js`: `retrieveContextDetailed` e `retrieveKnowledgeHits` | NULL (`missing_usage`) |
| `embed_doc` | `embedContent` de cada pedaço ingerido | `lib/knowledge.js`: `ingestDocument` | NULL (`missing_usage`) |
| `council_member`, `council_peer`, `council_chairman` | Chamadas do conselho (Bloco C): independente, peer-rank e síntese | `network-agents-setup`: `runner/plan_runner/council_session.py:86` (não é o MCP) | `usageMetadata` |

- Os campos vêm da resposta Gemini, com o formato confirmado por chamadas reais em 2026-09-30:
  - `tokens_in`, `tokens_out` e `tokens_total` vêm de `promptTokenCount`, `candidatesTokenCount` e `totalTokenCount`;
  - `service_tier` vem de `serviceTier`;
  - `model_version` vem de `modelVersion` (ex.: `gemini-3.5-flash-lite`; o `-latest` pedido é um alias);
  - `response_id` vem de `responseId`;
  - `raw_usage` guarda o `usageMetadata` inteiro.
- O `embedContent` **não devolve** `usageMetadata`. Os embeddings contam chamadas, não tokens.
- `run_id`: é um por pedido MCP (`app/api/mcp/route.js:57`) e liga router, embedding e agente do mesmo pedido. `ingest_knowledge`, `retrieve_knowledge` e `/api/ingest` também geram o seu.

## Garantia: a medição nunca estraga a resposta

- `recordTokenUsage()` é síncrona e nunca lança (`lib/tokenLedger.js`). Quem chama não faz `await` de nada.
- A escrita corre com `after()` do `next/server`, depois de a resposta sair. Se `after()` não estiver disponível (fora de um pedido Next), fica como promessa solta que nunca rejeita.
- Testes (`npm test`, 12 casos):
  - falha do Supabase (rede ou 500): a resposta chega igual;
  - Supabase pendurado 1,5 s: o `callGemini` responde em menos de 300 ms;
  - `usageMetadata` ausente ou malformado não quebra nada;
  - erro da API Gemini: o erro é o mesmo de antes e não grava nenhuma linha;
  - sem Supabase configurado: não faz nada.
- Verificado também num `next start` real (e2e local), numa chamada MCP `ask_agent_network`:
  - com o `after()` a gravar, 3 linhas com o mesmo `run_id`;
  - com cada escrita pendurada 2 s, a resposta HTTP saiu em 213 ms;
  - com as escritas a falhar, o servidor continuou de pé.

## Passos para o DEV (por ordem)

### 1. Criar a tabela (antes do merge)
Supabase → projecto **`agent-network-memory`** (`mpsuurqilnhsvbnjmrpm`) → **SQL Editor** → colar [`memory/token_usage.sql`](../../memory/token_usage.sql) → Run.
- É idempotente: pode correr mais de uma vez.
- Liga o RLS sem políticas e faz `REVOKE` ao `anon`/`authenticated`. Só o `service_role` (o servidor MCP) escreve e lê.
- Foi testado num Postgres 16 local com os papéis do Supabase: 2 execuções seguidas, `anon` recusado e `service_role` a gravar.

### 2. Confirmar a tabela
```sql
select count(*) from information_schema.columns
where table_schema = 'public' and table_name = 'token_usage';          -- esperado 14
select relrowsecurity from pg_class where relname = 'token_usage';     -- esperado true
select grantee, privilege_type from information_schema.role_table_grants
where table_name = 'token_usage' and grantee in ('anon', 'authenticated');  -- esperado 0 linhas
```

### 3. Merge do PR (decisão do maestro)
O Vercel faz deploy automático da `main` para produção. Por isso o passo 1 vem **antes** do merge. Se não vier, as escritas falham até a tabela existir (sem efeito na resposta).

### 4. Primeira linha depois de um pedido real
Pelo conector do Claude.ai, fazer um pedido ao `ask_agent_network`. Depois:
```sql
select created_at, run_id, call_kind, agent_id, model, model_version,
       tokens_in, tokens_out, tokens_total, status, service_tier, response_id
from token_usage order by created_at desc limit 5;
```
Esperado: 3 linhas com o mesmo `run_id`:
- `router`: `agent_id` NULL, `status` `ok`;
- `embed_query`: `status` `missing_usage`, tokens NULL;
- `agent`: `status` `ok`, `model_version` `gemini-3.5-flash-lite`.

Registar aqui: `____-__-__ — 1.ª linha: SIM / NÃO — run_id: ________`.

### 5. Consultas úteis
```sql
-- Consumo por dia e por agente (só generateContent tem tokens)
select date_trunc('day', created_at) as dia, agent_id, call_kind,
       count(*) as chamadas, sum(tokens_in) as tokens_in,
       sum(tokens_out) as tokens_out, sum(tokens_total) as tokens_total
from token_usage
where created_at > now() - interval '30 days'
group by 1, 2, 3 order by 1 desc, tokens_total desc nulls last;

-- Custo por pedido (router + embeddings + agente)
select run_id, min(created_at) as quando, max(agent_id) as agente,
       count(*) as chamadas, sum(tokens_total) as tokens
from token_usage group by run_id order by quando desc limit 20;

-- generateContent sem usageMetadata (devia ser 0; se não, a API mudou)
select count(*) from token_usage
where status = 'missing_usage' and call_kind in ('router', 'agent');
```

## Se algo falhar
| Sintoma | Causa provável |
|---|---|
| Log `[token_usage] falha ao gravar: relation "public.token_usage" does not exist` | O passo 1 ainda não correu |
| Log `[token_usage] falha ao gravar: permission denied` | O `SUPABASE_SERVICE_ROLE_KEY` do Vercel não é o `service_role` |
| Log `[token_usage] missing_usage: agent …` | A API deixou de devolver `usageMetadata`; ver `raw_usage` e a resposta |
| Nenhuma linha e nenhum log | Faltam `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` no ambiente: memória desligada, e o ledger também |

## Reverter
Fazer revert do PR. A tabela pode ficar (não é lida por nada). Para a apagar, **irreversível**: `drop table if exists public.token_usage;`
