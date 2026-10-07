-- Retenção das transcrições: apagar 60 dias depois da criação.
--
-- Decisão do maestro (2026-10-07): "pode apagar desde a criação. se for o caso
-- transcrevemos novamente". Sem período de graça. Política de privacidade
-- (network-agents-setup docs/governance/PRIVACY-POLICY.md §7), P-41 e GOV-RET-1.
--
-- O fluxo do reel não muda: o content_analyst dispara o transcribe.yml e lê logo a
-- transcrição nova (que nasce com 60 dias de vida). Uma transcrição apagada volta a
-- existir se o mesmo link for transcrito outra vez.
--
-- Idempotente: pode correr 2x sem erro. Só a parte do pg_cron exige a extensão
-- (instalada no Supabase do projecto agent-network-memory); sem ela, é ignorada.
-- A limpeza por tamanho (cleanup_old_transcripts_if_needed) continua como rede de
-- segurança; esta é a regra de retenção.
--
-- Aplicar: o DEV, no SQL Editor do Supabase (escreve em produção). Na 1.ª execução,
-- o job apaga as transcrições com mais de 60 dias (35 em 2026-10-07).

-- 1. Prazo por linha. As existentes contam desde a criação.
alter table public.transcripts add column if not exists expires_at timestamptz;
update public.transcripts set expires_at = created_at + interval '60 days' where expires_at is null;
alter table public.transcripts alter column expires_at set default (now() + interval '60 days');
alter table public.transcripts alter column expires_at set not null;
create index if not exists idx_transcripts_expires_at on public.transcripts (expires_at);

-- 2. Purga: apaga o que expirou e devolve quantas linhas saíram.
create or replace function public.purge_expired_transcripts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  delete from public.transcripts where expires_at < now();
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Só o dono (postgres) e o service_role a correm; nunca a API pública.
revoke all on function public.purge_expired_transcripts() from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.purge_expired_transcripts() from anon, authenticated';
  end if;
end;
$$;

-- 3. Agendamento diário às 03:17 UTC (o cleanup-agent-logs-daily corre às 03:00).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'purge-expired-transcripts';
    perform cron.schedule('purge-expired-transcripts', '17 3 * * *', 'select public.purge_expired_transcripts()');
  end if;
end;
$$;
