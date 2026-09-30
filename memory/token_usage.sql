-- J6: ledger de tokens -- 1 linha por chamada Gemini (generateContent e embedContent).
-- Executa isto no SQL editor do Supabase (projecto agent-network-memory).
-- Idempotente: pode correr mais de uma vez sem erro nem duplicar nada.
-- Passos e verificação: docs/ops/TOKEN-LEDGER.md

create table if not exists public.token_usage (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  run_id uuid,                -- 1 por pedido MCP (liga router + agente + embeddings)
  agent_id text,              -- NULL na chamada do router (ainda não há agente)
  call_kind text not null
    check (call_kind in ('router', 'agent', 'embed_query', 'embed_doc')),
  model text not null,        -- o pedido, ex.: gemini-flash-lite-latest
  model_version text,         -- o devolvido, ex.: gemini-3.5-flash-lite
  tokens_in integer,          -- usageMetadata.promptTokenCount      (NULL nos embeddings)
  tokens_out integer,         -- usageMetadata.candidatesTokenCount  (NULL nos embeddings)
  tokens_total integer,       -- usageMetadata.totalTokenCount       (NULL nos embeddings)
  status text not null
    check (status in ('ok', 'missing_usage')),
  raw_usage jsonb,            -- usageMetadata inteiro, quando existe
  service_tier text,          -- usageMetadata.serviceTier
  response_id text            -- responseId
);

create index if not exists idx_token_usage_created_at on public.token_usage (created_at desc);
create index if not exists idx_token_usage_run_id on public.token_usage (run_id);
create index if not exists idx_token_usage_agent_created on public.token_usage (agent_id, created_at desc);

-- Só o servidor MCP escreve (service_role, que ignora RLS). RLS ligado e sem
-- políticas = anon/authenticated sem acesso. O REVOKE é preciso porque o
-- default ACL deste projecto dá ALL ao anon em tabelas novas do schema public.
alter table public.token_usage enable row level security;
revoke all on table public.token_usage from anon, authenticated;
