-- Executa isto no SQL editor do teu projeto Supabase antes de correr o orquestrador.

create table if not exists project_state (
  id uuid primary key default gen_random_uuid(),
  project text not null,
  key text not null,
  value jsonb not null,
  updated_at timestamptz default now(),
  unique (project, key)
);

create table if not exists agent_log (
  id uuid primary key default gen_random_uuid(),
  project text not null,
  agent text not null,
  summary text not null,
  created_at timestamptz default now()
);

create index if not exists idx_project_state_project on project_state (project);
create index if not exists idx_agent_log_project on agent_log (project);

-- ============================================================
-- RAG: base de conhecimento pesquisável por embeddings
-- ============================================================

create extension if not exists vector;

create table if not exists knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null,
  source text not null,           -- ex: "SKILL.md advogado-especialista"
  content text not null,          -- o pedaço de texto real
  embedding vector(768),
  created_at timestamptz default now()
);

create index if not exists idx_knowledge_chunks_agent on knowledge_chunks (agent_id);

-- pesquisa por similaridade (cosine distance) filtrada por agente
create or replace function match_knowledge (
  query_embedding vector(768),
  match_agent_id text,
  match_count int default 4
)
returns table (id uuid, content text, source text, similarity float)
language sql stable
as $$
  select id, content, source, 1 - (embedding <=> query_embedding) as similarity
  from knowledge_chunks
  where agent_id = match_agent_id
  order by embedding <=> query_embedding
  limit match_count;
$$;
