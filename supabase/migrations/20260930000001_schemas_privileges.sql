-- Private Points V1 · migration proposta em docs/database.md (revisão 2).
-- STATUS: NÃO executada em um Postgres real nesta etapa; validar com `supabase db reset` (Fase 2) e testes pgTAP.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Supabase concede privilégios amplos por padrão em tabelas novas: fechar.
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

create table public.app_config (            -- flags operacionais (ex.: desligar o hook em emergência)
  key text primary key, value jsonb not null, updated_at timestamptz not null default now()
);
alter table public.app_config enable row level security;   -- sem policies = ninguém do cliente lê
