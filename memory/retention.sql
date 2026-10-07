-- Retenção por data do conteúdo extraído por links (política de privacidade:
-- network-agents-setup docs/governance/PRIVACY-POLICY.md §7; P-41; GOV-RET-1).
--
-- Decisões do maestro (2026-10-07):
--   transcripts  -> 60 dias desde a criação, sem período de graça
--                   ("se for o caso transcrevemos novamente");
--   image_posts  -> 60 dias (posts de terceiros no Instagram);
--   scrapes      -> opção B: 60 dias por omissão; 12 meses quando o site é teu
--                   (domínios em public.retention_own_domains).
--
-- Só apaga LINHAS destas tabelas, que são cópias extraídas. Nunca toca nos sites,
-- nos vídeos nem nos posts de origem, nem nos ficheiros do Storage (as capturas
-- visual-review dos teus sites ficam).
--
-- O fluxo do reel não muda: o content_analyst dispara o transcribe.yml e lê logo a
-- transcrição nova (nasce com 60 dias de vida). Um link apagado volta a existir se
-- for extraído outra vez.
--
-- Idempotente: pode correr 2x sem erro. A parte do pg_cron só corre se a extensão
-- existir (instalada no Supabase do projecto agent-network-memory). A limpeza por
-- tamanho (cleanup_old_transcripts_if_needed) continua como rede de segurança.
--
-- Aplicar: o DEV, no SQL Editor do Supabase (escreve em produção). Na 1.ª execução,
-- o job apaga o que já passou do prazo (2026-10-07: 35 transcripts e as 9 linhas de
-- image_posts; os 2 scrapes são de viannalegal.com.br e ficam 12 meses).

-- 0. Os teus domínios: os scrapes destes sites (e subdomínios) ficam 12 meses.
--    Para acrescentar um site: insert into public.retention_own_domains values ('exemplo.com');
create table if not exists public.retention_own_domains (
  domain text primary key check (domain = lower(btrim(domain)) and domain !~ '^https?://' and domain <> '')
);
alter table public.retention_own_domains enable row level security;  -- sem políticas: só o service_role
insert into public.retention_own_domains (domain) values ('viannalegal.com.br') on conflict do nothing;

create or replace function public.scrape_expires_at(p_url text, p_created_at timestamptz)
returns timestamptz
language sql
stable
set search_path = public
as $$
  select p_created_at + case
    when exists (
      select 1 from public.retention_own_domains d,
        lateral (select lower(substring(p_url from '^[a-zA-Z]+://(?:[^@/]*@)?([^/:?#]+)')) as host) h
      where h.host = d.domain or h.host like '%.' || d.domain
    ) then interval '12 months'
    else interval '60 days'
  end
$$;

-- 1. Prazo por linha. O que já existe conta desde a criação.
alter table public.transcripts add column if not exists expires_at timestamptz;
update public.transcripts set expires_at = created_at + interval '60 days' where expires_at is null;
alter table public.transcripts alter column expires_at set default (now() + interval '60 days');
alter table public.transcripts alter column expires_at set not null;
create index if not exists idx_transcripts_expires_at on public.transcripts (expires_at);

alter table public.image_posts add column if not exists expires_at timestamptz;
update public.image_posts set expires_at = created_at + interval '60 days' where expires_at is null;
alter table public.image_posts alter column expires_at set default (now() + interval '60 days');
alter table public.image_posts alter column expires_at set not null;
create index if not exists idx_image_posts_expires_at on public.image_posts (expires_at);

-- scrapes: o prazo depende do domínio. Recalculado a cada aplicação (um domínio
-- acrescentado depois passa a valer também para os scrapes que já existem).
alter table public.scrapes add column if not exists expires_at timestamptz;
update public.scrapes set expires_at = public.scrape_expires_at(url, created_at);
alter table public.scrapes alter column expires_at set not null;
create index if not exists idx_scrapes_expires_at on public.scrapes (expires_at);

create or replace function public.scrapes_set_expires_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.expires_at := public.scrape_expires_at(new.url, coalesce(new.created_at, now()));
  return new;
end;
$$;
drop trigger if exists scrapes_set_expires_at on public.scrapes;
create trigger scrapes_set_expires_at before insert or update of url on public.scrapes
  for each row execute function public.scrapes_set_expires_at();

-- 2. Purga: apaga o que expirou nas 3 tabelas e diz quantas linhas saíram.
drop function if exists public.purge_expired_transcripts();  -- nome da 1.ª versão (nunca aplicada)
create or replace function public.purge_expired_content()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  n_t integer; n_i integer; n_s integer;
begin
  delete from public.transcripts where expires_at < now(); get diagnostics n_t = row_count;
  delete from public.image_posts where expires_at < now(); get diagnostics n_i = row_count;
  delete from public.scrapes     where expires_at < now(); get diagnostics n_s = row_count;
  return json_build_object('transcripts', n_t, 'image_posts', n_i, 'scrapes', n_s);
end;
$$;

-- Só o dono (postgres) e o service_role as correm; nunca a API pública.
revoke all on function public.purge_expired_content() from public;
revoke all on function public.scrape_expires_at(text, timestamptz) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.purge_expired_content() from anon, authenticated';
    execute 'revoke all on function public.scrape_expires_at(text, timestamptz) from anon, authenticated';
  end if;
end;
$$;

-- 3. Agendamento diário às 03:17 UTC (o cleanup-agent-logs-daily corre às 03:00).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job
      where jobname in ('purge-expired-transcripts', 'purge-expired-content');
    perform cron.schedule('purge-expired-content', '17 3 * * *', 'select public.purge_expired_content()');
  end if;
end;
$$;
