-- SPIKE do Custom Access Token Hook (NÃO é migration; descartável). STATUS: NÃO EXECUTADO (sem Postgres/Supabase aqui).
-- Objetivo: (a) descobrir o que a documentação não confirma e (b) PROVAR que o hook atende à regra de produto:
--   S1 A ativo -> B recusado -> A continua válido ;  S2 após 30 dias de inatividade -> B permitido ;  S3 recovery -> A invalidado, B autorizado.
-- Aplicar:  psql "$DB_URL" -f supabase/spike/001_hook_probe.sql   e habilitar o hook (config.toml ou painel).

create schema if not exists spike;

create table if not exists spike.config (key text primary key, value text not null);
insert into spike.config values ('mode','observe'), ('deny_code','403'), ('ttl','30 days')
  on conflict (key) do nothing;

create table if not exists spike.hook_events (
  id bigint generated always as identity primary key,
  at timestamptz not null default clock_timestamp(),
  user_id uuid,
  auth_method text,                 -- valor EXATO de authentication_method (pergunta aberta #1)
  session_id uuid,
  session_row_exists boolean,       -- auth.sessions já contém a sessão quando o hook roda? (pergunta aberta #2)
  sessions_for_user int,
  event_keys text[],
  claim_keys text[],
  decision text
);

create table if not exists spike.device_sessions (
  auth_session_id uuid primary key,
  account_id uuid not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoke_reason text
);
create unique index if not exists spike_one_live_session on spike.device_sessions(account_id) where revoked_at is null;

-- Simula "B concluiu a confirmação por e-mail de Recuperar conta": abre uma janela de login de uso único.
create table if not exists spike.recovery (
  account_id uuid primary key,
  window_until timestamptz not null,
  consumed_at timestamptz
);

create or replace function public.custom_access_token_hook(event jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := (event->>'user_id')::uuid;
  v_sid    uuid := (event->'claims'->>'session_id')::uuid;
  v_method text := event->>'authentication_method';
  v_mode   text; v_code int; v_ttl interval;
  v_live   spike.device_sessions;
  v_alive  boolean;
  v_dec    text := 'allow';
begin
  select value into v_mode from spike.config where key = 'mode';
  select value::int into v_code from spike.config where key = 'deny_code';
  select value::interval into v_ttl from spike.config where key = 'ttl';

  if coalesce(v_mode, 'observe') = 'enforce' then
    select * into v_live from spike.device_sessions where account_id = v_uid and revoked_at is null for update;
    if v_method = 'token_refresh' then
      if found and v_live.auth_session_id = v_sid and v_live.last_seen_at > now() - v_ttl then
        update spike.device_sessions set last_seen_at = now() where auth_session_id = v_sid;
      else
        v_dec := 'deny_refresh';
      end if;
    elsif v_method = 'password' then
      if found and v_live.auth_session_id <> v_sid then
        v_alive := exists (select 1 from auth.sessions s where s.id = v_live.auth_session_id);
        if v_alive and v_live.last_seen_at > now() - v_ttl then
          if exists (select 1 from spike.recovery r where r.account_id = v_uid and r.consumed_at is null and r.window_until > now()) then
            update spike.device_sessions set revoked_at = now(), revoke_reason = 'ACCOUNT_RECOVERY' where auth_session_id = v_live.auth_session_id;
            update spike.recovery set consumed_at = now() where account_id = v_uid;
          else
            v_dec := 'deny_login';                                  -- S1: A viva e dentro do TTL
          end if;
        else
          update spike.device_sessions set revoked_at = now(),
                 revoke_reason = case when v_alive then 'INACTIVITY_EXPIRED' else 'AUTH_SESSION_GONE' end
           where auth_session_id = v_live.auth_session_id;           -- S2: expirada (ou sessão do Auth inexistente)
        end if;
      end if;
      if v_dec = 'allow' then
        insert into spike.device_sessions(auth_session_id, account_id) values (v_sid, v_uid) on conflict do nothing;
      end if;
    end if;                                  -- outros métodos: permitir e registrar (valores a descobrir)
  end if;

  insert into spike.hook_events(user_id, auth_method, session_id, session_row_exists, sessions_for_user,
                                event_keys, claim_keys, decision)
  values (v_uid, v_method, v_sid,
          exists (select 1 from auth.sessions s where s.id = v_sid),
          (select count(*) from auth.sessions s where s.user_id = v_uid),
          array(select jsonb_object_keys(event)), array(select jsonb_object_keys(event->'claims')), v_dec);

  if v_dec <> 'allow' then
    return jsonb_build_object('error', jsonb_build_object('http_code', v_code, 'message', 'session_not_authorized'));
  end if;
  return jsonb_build_object('claims', event->'claims');       -- sucesso conforme a documentação
end $$;

grant usage on schema spike to supabase_auth_admin;
grant all on all tables in schema spike to supabase_auth_admin;
grant execute on function public.custom_access_token_hook to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook from authenticated, anon, public;
