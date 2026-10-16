# Private Points — Banco de dados V1

> **Revisão 3** (decisões D15–D25; relógio monotônico rebaixado a medida local, UNVERIFIED imutável, hook conforme a documentação). Proposta de DDL/migrations (pré-Fase 1). O SQL abaixo é a **referência de projeto**; a versão final entra em `supabase/migrations/` com testes (pgTAP e integração). Funções marcadas *pseudocódigo* precisam de revisão linha a linha ao serem migradas.
> Confiança: veja a legenda em [architecture.md](architecture.md).

## 1. Modelo e relações

```text
auth.users (Supabase)
   │  (mesmo UUID, SEM FK — ver §2)
accounts ─┬─ profiles            (dados pessoais: nome)       ← apagado na exclusão
          ├─ usernames           (display + normalizado, estados RESERVED/ACTIVE/RESTRICTED)
          ├─ device_sessions     (sessão única)
          ├─ points_balance ── points_ledger   (append-only)
          ├─ task_executions ── execution_events (append-only)
          ├─ recovery_requests
          └─ deletion_requests
task_definitions (catálogo)      audit_logs (append-only)      rate_limit_counters
```

## 2. Identidade técnica separada (spec 14 e 44)

`accounts.id` recebe o **mesmo UUID** de `auth.users.id` na criação, mas **não há FK** para `auth.users`. Motivo: na exclusão, o usuário do Auth é removido (e-mail desvinculado) e o registro `accounts` permanece como *tombstone* sem dados pessoais, preservando a integridade do ledger (D05). Nome e username não são identidade técnica.

## 3. Migrations propostas

| Arquivo | Conteúdo |
|---------|----------|
| `0001_schemas_privileges.sql` | schema `private`, revogações padrão |
| `0002_accounts_profiles_usernames.sql` | tabelas de conta, funções `claim_username` |
| `0003_device_sessions.sql` | sessão única + hook |
| `0004_points.sql` | ledger, saldo, `post_ledger_entry` |
| `0005_tasks_executions.sql` | catálogo, execuções, eventos, RPCs |
| `0006_audit_ratelimit.sql` | auditoria, rate limit |
| `0007_recovery_deletion.sql` | tabelas de recuperação/exclusão |
| `0008_triggers_auth.sql` | triggers em `auth.users` |
| `0009_rls_grants.sql` | RLS e grants |
| `0010_seed.sql` | tarefas V1 |

### 0001 — schemas e privilégios

```sql
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
```

### 0002 — conta, perfil, username

```sql
create table public.accounts (
  id            uuid primary key,                                    -- = auth.users.id (sem FK, ver §2)
  status        text not null default 'PENDING_EMAIL'
                check (status in ('PENDING_EMAIL','ACTIVE','DELETING','DELETED')),
  created_at    timestamptz not null default now(),
  activated_at  timestamptz,
  deleted_at    timestamptz,
  constraint activated_when_active check ((status <> 'ACTIVE') or activated_at is not null)
);
-- Regra futura (spec 57): "não enviar Points nos primeiros 30 dias" = created_at + interval '30 days'.
-- Não exige coluna nova; nada é implementado na V1.

create table public.profiles (                      -- dados pessoais; removido na exclusão
  account_id uuid primary key references public.accounts(id) on delete cascade,
  full_name  text not null check (char_length(btrim(full_name)) between 1 and 80),   -- [DECISÃO] limite técnico
  created_at timestamptz not null default now()
);

create table public.usernames (
  username_normalized text primary key
                      check (username_normalized ~ '^[a-z0-9_-]{3,20}$'),            -- UNIQUE global, case-insensitive
  username_display    text not null
                      check (username_display ~ '^[A-Za-z0-9_-]{3,20}$'
                             and lower(username_display) = username_normalized),
  account_id          uuid not null references public.accounts(id),
  state               text not null check (state in ('RESERVED','ACTIVE','RESTRICTED')),
  reserved_until      timestamptz,                  -- RESERVED: created + 24 h (D04)
  restricted_until    timestamptz,                  -- RESTRICTED: exclusão + 90 dias (spec 14)
  created_at          timestamptz not null default now(),
  constraint state_dates check (
    (state = 'RESERVED'   and reserved_until   is not null) or
    (state = 'ACTIVE'     and reserved_until   is null and restricted_until is null) or
    (state = 'RESTRICTED' and restricted_until is not null))
);
create index usernames_account_idx on public.usernames(account_id);
-- Imutabilidade: nenhum UPDATE de username_* permitido por trigger (só state/datas mudam via funções).

create function private.claim_username(p_account uuid, p_display text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_norm text := lower(p_display);
begin
  perform pg_advisory_xact_lock(hashtextextended('username:' || v_norm, 0));
  -- libera apenas reservas vencidas e restrições vencidas (nunca bloqueio histórico permanente)
  delete from public.usernames
   where username_normalized = v_norm
     and ((state = 'RESERVED'   and reserved_until   < now())
       or (state = 'RESTRICTED' and restricted_until < now()));
  insert into public.usernames(username_normalized, username_display, account_id, state, reserved_until)
  values (v_norm, p_display, p_account, 'RESERVED', now() + interval '24 hours');
exception when unique_violation then
  raise exception 'username_unavailable' using errcode = 'P0001';
end $$;
```

### 0003 — sessão única (D03, D10-B)

```sql
create table public.device_sessions (
  id                uuid primary key default gen_random_uuid(),
  account_id        uuid not null references public.accounts(id),
  auth_session_id   uuid not null unique,          -- auth.sessions.id = claim "session_id" do JWT
  device_install_id uuid,                          -- informativo; NUNCA é identidade/autoridade
  platform          text check (platform in ('android','ios')),
  app_version       text,
  created_at        timestamptz not null default now(),
  last_seen_at      timestamptz not null default now(),
  revoked_at        timestamptz,
  revoke_reason     text check (revoke_reason in
    ('LOGOUT','INACTIVITY_EXPIRED','ACCOUNT_RECOVERY','PASSWORD_RESET','ACCOUNT_DELETED','AUTH_SESSION_GONE','ADMIN')),
  constraint revoked_consistent check ((revoked_at is null) = (revoke_reason is null))
);
-- no máximo UMA sessão não revogada por conta (concorrência resolvida pelo banco)
create unique index one_live_session_per_account on public.device_sessions(account_id) where revoked_at is null;

create function private.session_ttl() returns interval language sql immutable as $$ select interval '30 days' $$;

create function private.revoke_device_session(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_acc uuid;
begin
  update public.device_sessions set revoked_at = now(), revoke_reason = p_reason
   where id = p_id and revoked_at is null returning account_id into v_acc;
  if v_acc is null then return; end if;
  -- execução ativa não sobrevive à sessão que a iniciou
  update public.task_executions set state = 'INTERRUPTED', end_reason = 'SESSION_REVOKED',
         finished_at = clock_timestamp(), updated_at = now()
   where account_id = v_acc and state = 'RUNNING';
  perform private.audit('SECURITY_EVENT', v_acc, 'info', jsonb_build_object('event','session_revoked','reason',p_reason));
end $$;

-- Hook: public.custom_access_token_hook (configurar em Authentication > Hooks)
create function public.custom_access_token_hook(event jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := (event->>'user_id')::uuid;
  v_sid    uuid := (event->'claims'->>'session_id')::uuid;
  v_method text := event->>'authentication_method';
  v_row    public.device_sessions;
  v_alive  boolean;
  v_denied jsonb := jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'session_not_authorized'));
begin
  if coalesce((select (value)::boolean from public.app_config where key = 'session_hook_enabled'), true) is false then
    return jsonb_build_object('claims', event->'claims');                                        -- válvula de emergência (R4)
  end if;
  perform pg_advisory_xact_lock(hashtextextended('sess:' || v_uid::text, 0));
  select * into v_row from public.device_sessions where account_id = v_uid and revoked_at is null for update;

  if v_method = 'token_refresh' then                     -- só a sessão vigente renova
    if found and v_row.auth_session_id = v_sid and v_row.last_seen_at > now() - private.session_ttl() then
      update public.device_sessions set last_seen_at = now() where id = v_row.id;
      return jsonb_build_object('claims', event->'claims');
    end if;
    return v_denied;
  end if;

  if v_method <> 'password' then return jsonb_build_object('claims', event->'claims'); end if;   -- recovery/confirmação: JWT sem sessão de dispositivo

  if found then
    if v_row.auth_session_id = v_sid then return jsonb_build_object('claims', event->'claims'); end if;
    v_alive := exists (select 1 from auth.sessions s where s.id = v_row.auth_session_id);
    if v_alive and v_row.last_seen_at > now() - private.session_ttl() then
      -- sessão viva de outro dispositivo: só passa com janela de Recuperar conta confirmada
      if exists (select 1 from public.recovery_requests r
                  where r.account_id = v_uid and r.status = 'CONFIRMED' and r.login_window_until > now()) then
        perform private.revoke_device_session(v_row.id, 'ACCOUNT_RECOVERY');
        update public.recovery_requests set status = 'CONSUMED', consumed_at = now()
         where account_id = v_uid and status = 'CONFIRMED';
        perform private.audit('ACCOUNT_RECOVERY_COMPLETED', v_uid, 'info', '{}');
      else
        perform private.audit('SECURITY_EVENT', v_uid, 'warn', jsonb_build_object('event','login_blocked_live_session'));
        return v_denied;
      end if;
    else
      perform private.revoke_device_session(v_row.id, case when v_alive then 'INACTIVITY_EXPIRED' else 'AUTH_SESSION_GONE' end);
    end if;
  end if;

  insert into public.device_sessions(account_id, auth_session_id) values (v_uid, v_sid);
  perform private.audit('AUTH_LOGIN_SUCCESS', v_uid, 'info', '{}');
  return jsonb_build_object('claims', event->'claims');
end $$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook from public, anon, authenticated;
grant select, insert, update on public.device_sessions to supabase_auth_admin;   -- função é definer; grants por segurança
grant select on public.recovery_requests, public.app_config to supabase_auth_admin;
```

**O que a documentação oficial confirma sobre o hook (consultada em 30/09/2026) — e o que NÃO está confirmado:**

| Item | Situação |
|---|---|
| O hook roda **antes** de o token ser emitido e é disparado em **toda** emissão de token (login, refresh, OAuth) | **DOC** |
| Entrada: `user_id`, `claims` (inclui `session_id`), `authentication_method` | **DOC** |
| Saída de **sucesso** é `{ "claims": {...} }`; o Auth valida as claims obrigatórias (`iss, aud, exp, iat, sub, role, aal, session_id, email, phone, is_anonymous`) e falha se faltarem | **DOC** (por isso o SQL acima retorna `jsonb_build_object('claims', event->'claims')`, **não** `event`) |
| Saída de **erro**: objeto `{ "error": { "http_code", "message" } }` | **DOC/testes do Auth** mostram `http_code` customizado propagado em alguns códigos (ex.: 401) e ignorado em outros (ex.: 429/503) — **quais códigos o Postgres hook honra ao negar login, NÃO está confirmado** → spike |
| Tempo limite curto (um relato de log mostra 5 s para hook HTTP) | parcial — o limite do hook **Postgres** não está confirmado → spike; manter a função mínima |
| **Valores exatos de `authentication_method`** para login com senha, refresh, recuperação, confirmação de e-mail | **NÃO CONFIRMADO** (a doc mostra apenas `anonymous` como exemplo). O SQL usa os literais `'password'` e `'token_refresh'` **como hipótese** → spike obrigatório |
| A linha em `auth.sessions` **já existe** quando o hook roda? E **permanece** se o hook nega? | **NÃO CONFIRMADO** → spike |
| Chamar a API administrativa do Auth de dentro do hook para o mesmo usuário | há relato de falha em dev local → **não fazer**; o hook só lê/escreve tabelas próprias |

Notas:

- **Hook negando um login:** [SPIKE] verificar se o Auth já criou a linha em `auth.sessions` antes de chamar o hook; se criou, o item deve ser limpo (a função `sweep` remove sessões do Auth sem `device_sessions` há mais de 1 h).
- **Expiração (D03):** o teto de 30 dias é avaliado (a) no hook, (b) em `require_session()` a cada RPC, (c) em `private.session_is_current()` nas policies. Depois de expirada, **um login comum de outro dispositivo é aceito** (D17: a sessão foi abandonada) e **Recuperar conta continua disponível** o tempo todo.
- **Logout interrompido no meio:** se `auth.sessions` não contém mais o `auth_session_id`, o hook trata como `AUTH_SESSION_GONE`.
- **Reset de senha concluído:** trigger revoga a sessão de dispositivo vigente (`PASSWORD_RESET`) — decisão oficial D18.

### 0004 — Points

```sql
create table public.points_balance (
  account_id uuid primary key references public.accounts(id),
  balance    bigint not null default 0 check (balance >= 0),
  version    bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table public.points_ledger (
  id              uuid primary key default gen_random_uuid(),
  account_id      uuid not null references public.accounts(id),
  entry_type      text not null check (entry_type in ('INITIAL_GRANT','TASK_REWARD')),  -- V1; novos tipos = nova migration
  amount          bigint not null check (amount <> 0),
  balance_after   bigint not null check (balance_after >= 0),
  source          text not null check (source in ('SYSTEM','TASK_EXECUTION')),
  reference_type  text,
  reference_id    uuid,
  idempotency_key text not null unique,
  status          text not null default 'POSTED' check (status in ('POSTED','REVERSED')),
  metadata        jsonb not null default '{}'::jsonb,        -- somente dados não sensíveis
  created_at      timestamptz not null default now()
);
create index points_ledger_account_idx on public.points_ledger(account_id, created_at desc);
create unique index one_initial_grant_per_account on public.points_ledger(account_id) where entry_type = 'INITIAL_GRANT';
create unique index one_reward_per_execution      on public.points_ledger(reference_id) where entry_type = 'TASK_REWARD';

-- append-only: correções futuras = lançamentos compensatórios
create function private.ledger_immutable() returns trigger language plpgsql as $$
begin raise exception 'points_ledger is append-only'; end $$;
create trigger ledger_no_update before update or delete on public.points_ledger
  for each row execute function private.ledger_immutable();
create trigger ledger_no_truncate before truncate on public.points_ledger
  for each statement execute function private.ledger_immutable();

-- Crédito inicial (D19): só após confirmação de e-mail; idempotente por DUAS camadas independentes:
--   (1) idempotency_key 'initial:<account_id>' UNIQUE; (2) índice único parcial one_initial_grant_per_account.
create function private.initial_grant_points() returns bigint language sql immutable as $$ select 1000::bigint $$;

create function private.post_ledger_entry(
  p_account uuid, p_type text, p_amount bigint, p_source text,
  p_ref_type text, p_ref_id uuid, p_key text, p_meta jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_balance bigint; v_id uuid;
begin
  insert into public.points_balance(account_id) values (p_account) on conflict do nothing;
  select balance into v_balance from public.points_balance where account_id = p_account for update;   -- serializa por conta

  select id into v_id from public.points_ledger where idempotency_key = p_key and account_id = p_account;
  if found then return v_id; end if;                                   -- replay: mesmo resultado, sem novo lançamento
  if v_balance + p_amount < 0 then raise exception 'insufficient_balance'; end if;

  insert into public.points_ledger(account_id, entry_type, amount, balance_after, source,
                                   reference_type, reference_id, idempotency_key, metadata)
  values (p_account, p_type, p_amount, v_balance + p_amount, p_source, p_ref_type, p_ref_id, p_key, p_meta)
  returning id into v_id;
  update public.points_balance set balance = balance + p_amount, version = version + 1, updated_at = now()
   where account_id = p_account;
  perform private.audit(case when p_amount > 0 then 'POINTS_CREDITED' else 'POINTS_DEBITED' end, p_account, 'info',
                        jsonb_build_object('ledger_id', v_id, 'type', p_type, 'amount', p_amount));
  return v_id;
end $$;

-- Invariante verificável (testes e monitoramento): saldo == soma do ledger
create function private.verify_balances() returns table(account_id uuid, balance bigint, ledger_sum bigint)
language sql security definer set search_path = '' as $$
  select b.account_id, b.balance, coalesce(sum(l.amount), 0)
    from public.points_balance b left join public.points_ledger l on l.account_id = b.account_id
   group by b.account_id, b.balance having b.balance <> coalesce(sum(l.amount), 0) $$;
```

### 0005 — tarefas e execuções

```sql
create table public.task_definitions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  timer_kind text not null check (timer_kind in ('NORMAL','FOCUS')),
  duration_seconds int not null check (duration_seconds > 0),
  reward_points bigint not null check (reward_points > 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.task_executions (
  id                          uuid primary key default gen_random_uuid(),
  account_id                  uuid not null references public.accounts(id),
  task_id                     uuid not null references public.task_definitions(id),
  timer_kind                  text not null check (timer_kind in ('NORMAL','FOCUS')),   -- snapshot
  duration_seconds            int  not null check (duration_seconds > 0),               -- snapshot
  reward_points               bigint not null check (reward_points > 0),                -- snapshot
  state                       text not null default 'RUNNING'
                              check (state in ('RUNNING','COMPLETED','CANCELLED','INTERRUPTED','UNVERIFIED','EXPIRED','FAILED')),
  end_reason                  text,                                    -- validado por state_reason_map (abaixo)
  started_at                  timestamptz not null,                   -- RELÓGIO DO SERVIDOR (autoridade temporal)
  ends_at                     timestamptz not null,                   -- started_at + duração
  reconcile_until             timestamptz not null,                   -- ends_at + 7 dias (D15): horizonte de reconciliação, NÃO janela de resgate
  finished_at                 timestamptz,
  device_session_id           uuid not null references public.device_sessions(id),
  process_instance_id         uuid not null,                          -- gerado a cada início de processo (memória)
  boot_id                     text not null,
  client_started_monotonic_ms bigint not null,    -- referência LOCAL para medir tempo decorrido; NUNCA comparada a timestamp absoluto do servidor (timers.md §1.1)
  idempotency_key             uuid not null,
  reward_ledger_id            uuid unique references public.points_ledger(id),
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  constraint ends_after_start check (ends_at > started_at),
  constraint finished_iff_terminal check ((state = 'RUNNING') = (finished_at is null)),
  -- Estados NÃO se misturam: cada estado admite apenas os seus motivos (D22)
  constraint state_reason_map check (
       (state = 'RUNNING'     and end_reason is null)
    or (state = 'COMPLETED'   and end_reason = 'COMPLETED')
    or (state = 'CANCELLED'   and end_reason = 'USER_CANCELLED')
    or (state = 'INTERRUPTED' and end_reason in ('PROCESS_TERMINATED','DEVICE_REBOOT','FOCUS_LEFT_APP','FOCUS_LEAVE_CONFIRMED',
                                                 'SESSION_REVOKED','LOGOUT','ACCOUNT_DELETED'))
    or (state = 'UNVERIFIED'  and end_reason in ('CONTINUITY_UNVERIFIABLE','FOCUS_ABSENCE_UNATTRIBUTED'))
    or (state = 'EXPIRED'     and end_reason = 'STALE_EXPIRED')
    or (state = 'FAILED'      and end_reason = 'SERVER_FAILURE')),
  constraint reward_iff_completed  check ((state = 'COMPLETED') = (reward_ledger_id is not null)),
  unique (account_id, idempotency_key)
);
-- D08: uma execução ativa por conta, imposta pelo banco (não pela UI)
create unique index one_running_execution_per_account on public.task_executions(account_id) where state = 'RUNNING';
create index task_executions_history_idx on public.task_executions(account_id, started_at desc);

create function private.task_execution_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'task_executions cannot be deleted'; end if;
  if old.state <> 'RUNNING' then raise exception 'terminal_state_is_immutable'; end if;
  if (new.account_id, new.task_id, new.timer_kind, new.duration_seconds, new.reward_points, new.started_at, new.ends_at,
      new.process_instance_id, new.boot_id, new.device_session_id, new.reconcile_until)
     is distinct from
     (old.account_id, old.task_id, old.timer_kind, old.duration_seconds, old.reward_points, old.started_at, old.ends_at,
      old.process_instance_id, old.boot_id, old.device_session_id, old.reconcile_until) then
    raise exception 'immutable_columns';
  end if;
  return new;
end $$;
create trigger task_executions_guard before update or delete on public.task_executions
  for each row execute function private.task_execution_guard();

-- INVARIANTE NO BANCO (independente das funções): um lançamento TASK_REWARD só pode existir, ao fim da transação,
-- se a execução referenciada estiver COMPLETED, da mesma conta, com o mesmo ledger e o mesmo valor.
-- Logo é impossível haver crédito associado a execução UNVERIFIED/EXPIRED/CANCELLED/INTERRUPTED/RUNNING.
create function private.assert_reward_matches_execution() returns trigger language plpgsql as $$
begin
  if new.entry_type = 'TASK_REWARD' and not exists (
       select 1 from public.task_executions e
        where e.id = new.reference_id and e.account_id = new.account_id and e.state = 'COMPLETED'
          and e.reward_ledger_id = new.id and e.reward_points = new.amount) then
    raise exception 'task_reward_requires_completed_execution';
  end if;
  return null;
end $$;
create constraint trigger ledger_reward_matches_execution after insert on public.points_ledger
  deferrable initially deferred for each row execute function private.assert_reward_matches_execution();

create table public.execution_events (               -- append-only; received_at é SEMPRE do servidor
  id            bigint generated always as identity primary key,
  execution_id  uuid not null references public.task_executions(id),
  account_id    uuid not null references public.accounts(id),
  -- O cliente reporta OBSERVAÇÕES BRUTAS (tipo do evento). Não existe coluna de "causa"/classificação:
  -- quem classifica e decide é o servidor (private.absence_verdict / reconcile_execution).
  event_type    text not null check (event_type in
    ('STARTED','HEARTBEAT','APP_LAUNCH','FOREGROUND','BACKGROUND','SCREEN_LOCKED','SCREEN_UNLOCKED',
     'CALL_STARTED','CALL_ENDED','CHANNEL_SCREEN_OBSERVABLE','CHANNEL_CALL_OBSERVABLE',
     'LEAVE_ATTEMPT','LEAVE_CONFIRMED','LEAVE_CANCELLED')),
  client_mono_ms bigint not null,        -- monotônico local no evento: só serve para medir tempo decorrido desde o início local
  process_instance_id uuid not null,
  boot_id       text not null,
  received_at   timestamptz not null default clock_timestamp(),
  details       jsonb not null default '{}'::jsonb,     -- lista branca (ex.: process_exit {at, kind} no Android) — TELEMETRIA
  constraint boot_id_length  check (char_length(boot_id) between 1 and 128),
  constraint details_small   check (pg_column_size(details) <= 512)
);
create index execution_events_idx on public.execution_events(execution_id, id);
create trigger execution_events_immutable before update or delete on public.execution_events
  for each row execute function private.ledger_immutable();
```

**Correspondência com os estados da spec (seção 19):** `CREATED` é transitório (a RPC já cria em `RUNNING`); `BACKGROUND`/`SCREEN_LOCKED`/`FOREGROUND` são *fases* registradas em `execution_events`; persistem-se `RUNNING`, `COMPLETED`, `CANCELLED`, `INTERRUPTED`, `EXPIRED`, `FAILED` e **`UNVERIFIED`** (estado adicional permitido pela spec, seção 19: a duração transcorreu, mas a continuidade não pôde ser provada nem refutada). Diferenças e motivos permitidos por estado estão no `state_reason_map` e em [timers.md §2](timers.md).

#### Funções críticas

> **Regra de autoridade (D20):** *o cliente nunca é autoridade para conceder Points.* Nenhuma RPC aceita um parâmetro que afirme "concluí". O cliente envia **sinais** (eventos com identidade de processo, `boot_id`, relógio monotônico); o servidor os grava com o **seu** `received_at` e **reconcilia** a execução por regras determinísticas. O crédito só sai de `private.credit_execution`, chamada apenas por `private.reconcile_execution`, que pode ser disparada por uma RPC do cliente **ou** pelo job do servidor.

```sql
create function private.require_session() returns public.device_sessions
language plpgsql security definer set search_path = '' as $$
declare v_row public.device_sessions;
begin
  select ds.* into v_row from public.device_sessions ds
   where ds.account_id = auth.uid()
     and ds.auth_session_id = (auth.jwt()->>'session_id')::uuid
     and ds.revoked_at is null
     and ds.last_seen_at > now() - private.session_ttl();
  if not found then raise exception 'session_not_authorized' using errcode = '42501'; end if;
  if not exists (select 1 from public.accounts a where a.id = auth.uid() and a.status = 'ACTIVE') then
    raise exception 'account_not_active' using errcode = '42501';
  end if;
  if v_row.last_seen_at < now() - interval '10 minutes' then
    update public.device_sessions set last_seen_at = now() where id = v_row.id;
  end if;
  return v_row;
end $$;

-- Constantes técnicas
create function private.reconcile_horizon() returns interval language sql immutable as $$ select interval '7 days' $$;   -- D15
-- Tempo decorrido de um evento, SEM confiar em timestamp absoluto do cliente: o mínimo entre
--  (a) o decorrido local (monotônico do evento − monotônico do início local) e
--  (b) o decorrido do servidor até o RECEBIMENTO (um evento não pode ter ocorrido depois de recebido).
-- (a) mede só diferença local; (b) é do servidor. Um cliente hostil ainda pode ocultar eventos — ver security.md §9.
create function private.event_elapsed_ms(x public.task_executions, e public.execution_events) returns bigint
language sql immutable as $$
  select least(e.client_mono_ms - x.client_started_monotonic_ms,
               floor(extract(epoch from (e.received_at - x.started_at)) * 1000)::bigint) $$;

-- Ingestão de sinais: lista branca de tipos, identidade obrigatória, received_at = relógio do servidor
create function private.ingest_events(x public.task_executions, p_events jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare e jsonb;
begin
  if jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) not between 1 and 200 then
    raise exception 'invalid_events';
  end if;
  for e in select * from jsonb_array_elements(p_events) loop
    if exists (select 1 from jsonb_object_keys(e) k
                where k not in ('event_type','client_mono_ms','process_instance_id','boot_id','process_exit')) then
      raise exception 'invalid_event_field';                           -- rejeita completed/reward/points/state/... (D20)
    end if;
    if e ? 'process_exit' and (jsonb_typeof(e->'process_exit') <> 'object'
       or exists (select 1 from jsonb_object_keys(e->'process_exit') k where k not in ('at','kind'))) then
      raise exception 'invalid_event_field';
    end if;
    if (e->>'event_type') not in ('HEARTBEAT','APP_LAUNCH','FOREGROUND','BACKGROUND','SCREEN_LOCKED','SCREEN_UNLOCKED',
                                  'CALL_STARTED','CALL_ENDED','CHANNEL_SCREEN_OBSERVABLE','CHANNEL_CALL_OBSERVABLE',
                                  'LEAVE_ATTEMPT','LEAVE_CONFIRMED','LEAVE_CANCELLED') then
      raise exception 'invalid_event_type';                            -- STARTED é exclusivo do servidor
    end if;
    insert into public.execution_events(execution_id, account_id, event_type, client_mono_ms,
                                        process_instance_id, boot_id, details)
    values (x.id, x.account_id, e->>'event_type', (e->>'client_mono_ms')::bigint,
            (e->>'process_instance_id')::uuid, e->>'boot_id',
            jsonb_strip_nulls(jsonb_build_object('process_exit', e->'process_exit')));   -- só campos conhecidos
  end loop;
end $$;

-- Fecha uma execução em estado terminal SEM crédito (idempotente)
create function private.close_execution(p_id uuid, p_state text, p_reason text) returns public.task_executions
language plpgsql security definer set search_path = '' as $$
declare x public.task_executions;
begin
  update public.task_executions set state = p_state, end_reason = p_reason,
         finished_at = clock_timestamp(), updated_at = now()
   where id = p_id and state = 'RUNNING' returning * into x;
  if found then
    perform private.audit(case p_state when 'CANCELLED' then 'TASK_CANCELLED'
                                       when 'FAILED'    then 'SECURITY_EVENT'
                                       else 'TASK_INTERRUPTED' end,      -- INTERRUPTED/UNVERIFIED/EXPIRED: details.state distingue
                          x.account_id, 'info', jsonb_build_object('execution_id', p_id, 'state', p_state, 'reason', p_reason));
  else
    select * into x from public.task_executions where id = p_id;        -- já terminal
  end if;
  return x;
end $$;

-- Único ponto de crédito de tarefa. Defesa em profundidade: relê a linha SOB LOCK e só credita se AINDA for RUNNING;
-- usa os valores da linha travada (não do argumento). UNVERIFIED/EXPIRED/CANCELLED/INTERRUPTED/COMPLETED => exceção.
create function private.credit_execution(x public.task_executions) returns public.task_executions
language plpgsql security definer set search_path = '' as $$
declare v_ledger uuid; y public.task_executions;
begin
  select * into y from public.task_executions where id = x.id for update;
  if not found or y.state <> 'RUNNING' then
    raise exception 'credit_requires_running_execution';
  end if;
  v_ledger := private.post_ledger_entry(y.account_id, 'TASK_REWARD', y.reward_points, 'TASK_EXECUTION',
                'task_execution', y.id, 'reward:' || y.id::text, jsonb_build_object('timer_kind', y.timer_kind));
  update public.task_executions set state = 'COMPLETED', end_reason = 'COMPLETED', finished_at = clock_timestamp(),
         reward_ledger_id = v_ledger, updated_at = now()
   where id = y.id and state = 'RUNNING' returning * into y;
  if not found then raise exception 'credit_update_lost'; end if;       -- aborta a transação (o lançamento do ledger some)
  perform private.audit('TASK_COMPLETED', y.account_id, 'info', jsonb_build_object('execution_id', y.id));
  return y;
end $$;

-- CLASSIFICAÇÃO DE AUSÊNCIAS (Modo Foco) — DECIDIDA PELO SERVIDOR a partir de sinais BRUTOS (D26).
-- O cliente nunca informa "causa". Para cada BACKGROUND antes do fim o servidor procura corroboração nos demais sinais:
--   • SCREEN_LOCKED a ≤ Δ do BACKGROUND, ou
--   • CALL_STARTED já ativo (sem CALL_ENDED depois dele e antes do BACKGROUND) a ≤ Δ do BACKGROUND  (D01: ligação não invalida sozinha).
-- Sem corroboração: se a plataforma reportou TER os dois canais de observação (CHANNEL_*_OBSERVABLE) e nenhum viu bloqueio/ligação
--   ⇒ 'LEFT_APP' (saída do app); se algum canal não existe, não dá para excluir bloqueio/ligação ⇒ 'UNATTRIBUTED' (não verificável).
-- Declarar canal inexistente nunca ajuda o usuário: LEFT_APP => INTERRUPTED e UNATTRIBUTED => UNVERIFIED, ambos sem Points.
-- Δ = 3000 ms é tolerância TÉCNICA de ordenação entre sinais quase simultâneos do SO; não é regra de produto.
-- Espelhado por domain/timers/reference/absence.ts (modelo executável testado).
create function private.absence_verdict(x public.task_executions) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  b public.execution_events; v_t bigint; v_ok boolean;
  v_screen_obs boolean; v_call_obs boolean; v_result text := 'OK';
  v_delta constant bigint := 3000;
begin
  v_screen_obs := exists (select 1 from public.execution_events e where e.execution_id = x.id and e.event_type = 'CHANNEL_SCREEN_OBSERVABLE');
  v_call_obs   := exists (select 1 from public.execution_events e where e.execution_id = x.id and e.event_type = 'CHANNEL_CALL_OBSERVABLE');
  for b in select * from public.execution_events e where e.execution_id = x.id and e.event_type = 'BACKGROUND' order by e.id loop
    v_t := private.event_elapsed_ms(x, b);
    continue when v_t >= x.duration_seconds * 1000;                    -- ausência depois do fim não invalida
    v_ok := exists (select 1 from public.execution_events s
                     where s.execution_id = x.id and s.event_type = 'SCREEN_LOCKED'
                       and abs(private.event_elapsed_ms(x, s) - v_t) <= v_delta)
         or exists (select 1 from public.execution_events c
                     where c.execution_id = x.id and c.event_type = 'CALL_STARTED'
                       and private.event_elapsed_ms(x, c) <= v_t + v_delta
                       and not exists (select 1 from public.execution_events c2
                                        where c2.execution_id = x.id and c2.event_type = 'CALL_ENDED'
                                          and private.event_elapsed_ms(x, c2) > private.event_elapsed_ms(x, c)
                                          and private.event_elapsed_ms(x, c2) < v_t));
    if not v_ok then
      if v_screen_obs and v_call_obs then return 'LEFT_APP'; end if;
      v_result := 'UNATTRIBUTED';
    end if;
  end loop;
  return v_result;
end $$;

-- RECONCILIAÇÃO: decide o destino de uma execução RUNNING usando só evidência gravada no servidor.
-- Precedência: certo (INTERRUPTED) > não verificável (UNVERIFIED) > sinal consistente (COMPLETED) > espera > EXPIRED.
create function private.reconcile_execution(p_id uuid) returns public.task_executions
language plpgsql security definer set search_path = '' as $$
declare
  x public.task_executions; v_now timestamptz := clock_timestamp();
  v_change public.execution_events; v_proof public.execution_events; v_abs text;
begin
  select * into x from public.task_executions where id = p_id for update;
  if not found or x.state <> 'RUNNING' then return x; end if;           -- terminal é imutável (idempotência)

  -- R1 (Foco) saída do app segundo a classificação do SERVIDOR, ou saída confirmada pelo usuário, antes do fim → INTERRUPTED
  if x.timer_kind = 'FOCUS' then
    v_abs := private.absence_verdict(x);
    if v_abs = 'LEFT_APP' or exists (
         select 1 from public.execution_events e
          where e.execution_id = x.id and e.event_type = 'LEAVE_CONFIRMED'
            and private.event_elapsed_ms(x, e) < x.duration_seconds * 1000) then
      return private.close_execution(x.id, 'INTERRUPTED', 'FOCUS_LEFT_APP');
    end if;
  end if;

  -- primeiro relato com identidade diferente (outro processo ou outro boot)
  select e.* into v_change from public.execution_events e
   where e.execution_id = x.id and (e.process_instance_id <> x.process_instance_id or e.boot_id <> x.boot_id)
   order by e.id limit 1;

  -- R2 identidade mudou ANTES do fim (pelo relógio do servidor)              → INTERRUPTED
  if v_change.id is not null and v_change.received_at < x.ends_at then
    return private.close_execution(x.id, 'INTERRUPTED',
             case when v_change.boot_id <> x.boot_id then 'DEVICE_REBOOT' else 'PROCESS_TERMINATED' end);
  end if;

  -- R3 (Foco) ausência que o servidor não consegue atribuir com segurança → UNVERIFIED / FOCUS_ABSENCE_UNATTRIBUTED
  if x.timer_kind = 'FOCUS' and v_abs = 'UNATTRIBUTED' then
    return private.close_execution(x.id, 'UNVERIFIED', 'FOCUS_ABSENCE_UNATTRIBUTED');
  end if;

  -- R4 SINAL DE CONTINUIDADE CONSISTENTE: relato de MESMA identidade (processo+boot) RECEBIDO em/após ends_at → COMPLETED
  -- ATENÇÃO: isto é CONSISTÊNCIA entre duas asserções do cliente + tempo do servidor, NÃO prova de que o processo viveu
  -- nem de que o cliente é genuíno (um cliente comprometido forja ambos). Sem tolerância: comparação ESTRITA (>=) com
  -- ends_at; a margem de ~2 s do cliente é só para ENVIAR o sinal e não concede nada ao usuário.
  -- Tempo = relógio do servidor (received_at ≥ ends_at). Identidade = o processo nunca morreu desde o start.
  -- NÃO há comparação de relógios monotônico × servidor aqui: um cliente hostil escolhe o valor que quiser,
  -- então a checagem não acrescentaria segurança (timers.md §1.1).
  select e.* into v_proof from public.execution_events e
   where e.execution_id = x.id and e.process_instance_id = x.process_instance_id and e.boot_id = x.boot_id
     and e.received_at >= x.ends_at order by e.id limit 1;
  if v_proof.id is not null then
    return private.credit_execution(x);
  end if;

  -- R5 identidade diferente só DEPOIS do fim: cold start não prova morte nem vida  → UNVERIFIED (terminal, sem Points)
  -- (process_exit do Android fica em details como TELEMETRIA; carrega relógio de parede do aparelho e nunca credita.)
  if v_change.id is not null then
    return private.close_execution(x.id, 'UNVERIFIED', 'CONTINUITY_UNVERIFIABLE');
  end if;

  -- R6 nenhum relato em/após o fim
  if v_now > x.reconcile_until then                                                      -- D15: ends_at + 7 dias
    return private.close_execution(x.id, 'EXPIRED', 'STALE_EXPIRED');
  end if;
  return x;                                                                              -- segue RUNNING, aguardando evidência
end $$;

-- Job do servidor (D20): reconcilia execuções vencidas com a evidência JÁ gravada e expira as abandonadas
create function private.reconcile_due_executions(p_limit int default 200) returns int
language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0;
begin
  for r in select id from public.task_executions
            where state = 'RUNNING' and ends_at <= clock_timestamp() order by ends_at limit p_limit for update skip locked loop
    perform private.reconcile_execution(r.id); n := n + 1;
  end loop;
  return n;
end $$;
-- Agendamento: select cron.schedule('reconcile-due', '* * * * *', $$select private.reconcile_due_executions()$$);   [SPIKE pg_cron]
```

**`UNVERIFIED` é terminal e imutável (D23).** O trigger `task_execution_guard` rejeita **qualquer** `UPDATE` de uma linha cujo estado antigo não seja `RUNNING`; `reconcile_execution` retorna cedo para estados terminais; `credit_execution` só atualiza `WHERE state = 'RUNNING'`; e o ledger só aceita uma recompensa por execução. Portanto **nenhuma requisição do cliente pode produzir `UNVERIFIED → COMPLETED`**. Não existe, na V1, transição de reconciliação posterior a partir de `UNVERIFIED`, porque não há nenhuma evidência server-side que a justifique (o que faria `UNVERIFIED` legítimo é justamente a ausência dela). Se uma evidência nova passar a existir (p.ex. atestação Play Integrity/App Attest), a transição será **explícita**: nova migration com regra server-side própria, novo `end_reason`, auditoria, e testes — nunca por parâmetro do cliente. Teste pgTAP exigido (Fase 5): tentativa de `UPDATE task_executions SET state='COMPLETED' ... WHERE state='UNVERIFIED'` deve falhar, inclusive como `service_role`.

**RPCs do cliente** (todas `SECURITY DEFINER`, `search_path=''`, `require_session()`, EXECUTE só para `authenticated`):

```sql
create function public.start_task(
  p_task_code text, p_idempotency_key uuid, p_process_instance_id uuid, p_boot_id text, p_monotonic_ms bigint
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_sess public.device_sessions; v_task public.task_definitions; v_open public.task_executions;
        v_exec public.task_executions; v_now timestamptz;
begin
  v_sess := private.require_session();
  if not private.rate_limit_hit('start_task', v_sess.account_id::text, 10, 60) then
    return jsonb_build_object('error', 'rate_limited');            -- retorno (não exceção) para persistir a auditoria
  end if;
  perform pg_advisory_xact_lock(hashtextextended('exec:' || v_sess.account_id::text, 0));

  select * into v_exec from public.task_executions
   where account_id = v_sess.account_id and idempotency_key = p_idempotency_key;
  if found then return private.execution_json(v_exec); end if;     -- replay do mesmo pedido

  select * into v_task from public.task_definitions where code = p_task_code and active;
  if not found then return jsonb_build_object('error', 'task_not_found'); end if;

  -- auto-cura (D08): resolve a execução pendente com a identidade atual antes de aceitar outra
  select * into v_open from public.task_executions where account_id = v_sess.account_id and state = 'RUNNING' for update;
  if found then
    perform private.ingest_events(v_open, jsonb_build_array(jsonb_build_object(
      'event_type','HEARTBEAT','process_instance_id',p_process_instance_id,'boot_id',p_boot_id,'client_mono_ms',p_monotonic_ms)));
    v_open := private.reconcile_execution(v_open.id);
    if v_open.state = 'RUNNING' then
      return jsonb_build_object('error', 'active_execution_exists', 'execution_id', v_open.id);
    end if;
  end if;

  v_now := clock_timestamp();
  insert into public.task_executions(account_id, task_id, timer_kind, duration_seconds, reward_points, started_at, ends_at,
         reconcile_until, device_session_id, process_instance_id, boot_id, client_started_monotonic_ms, idempotency_key)
  values (v_sess.account_id, v_task.id, v_task.timer_kind, v_task.duration_seconds, v_task.reward_points, v_now,
          v_now + make_interval(secs => v_task.duration_seconds),
          v_now + make_interval(secs => v_task.duration_seconds) + private.reconcile_horizon(),
          v_sess.id, p_process_instance_id, p_boot_id, p_monotonic_ms, p_idempotency_key)
  returning * into v_exec;
  insert into public.execution_events(execution_id, account_id, event_type, client_mono_ms, process_instance_id, boot_id)
  values (v_exec.id, v_exec.account_id, 'STARTED', p_monotonic_ms, p_process_instance_id, p_boot_id);
  perform private.audit('TASK_STARTED', v_exec.account_id, 'info', jsonb_build_object('execution_id', v_exec.id, 'task', p_task_code));
  return private.execution_json(v_exec);
end $$;

-- Cliente ENVIA SINAIS e pede reconciliação. Não existe parâmetro "concluí": o resultado vem das regras R1–R6.
create function public.reconcile_task(p_execution_id uuid, p_events jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_sess public.device_sessions; x public.task_executions;
begin
  v_sess := private.require_session();
  if not private.rate_limit_hit('reconcile_task', v_sess.account_id::text, 30, 60) then
    return jsonb_build_object('error', 'rate_limited');
  end if;
  select * into x from public.task_executions where id = p_execution_id and account_id = v_sess.account_id for update;
  if not found or x.device_session_id <> v_sess.id then      -- só a sessão de dispositivo que iniciou pode reportar
    return jsonb_build_object('error', 'execution_not_found');
  end if;
  if x.state = 'RUNNING' then
    perform private.ingest_events(x, p_events);
    x := private.reconcile_execution(x.id);
  end if;
  return private.execution_json(x);                                -- terminal: devolve o estado final (replay idempotente)
end $$;

-- launch/foreground: mesma lógica para a execução ativa da conta (ou {state:'NONE'})
create function public.sync_active_execution(p_events jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_sess public.device_sessions; x public.task_executions;
begin
  v_sess := private.require_session();
  select * into x from public.task_executions
   where account_id = v_sess.account_id and state = 'RUNNING' and device_session_id = v_sess.id for update;
  if not found then return jsonb_build_object('state', 'NONE'); end if;
  perform private.ingest_events(x, p_events);
  return private.execution_json(private.reconcile_execution(x.id));
end $$;

create function public.cancel_task(p_execution_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_sess public.device_sessions; x public.task_executions;
begin
  v_sess := private.require_session();
  select * into x from public.task_executions where id = p_execution_id and account_id = v_sess.account_id for update;
  if not found then return jsonb_build_object('error', 'execution_not_found'); end if;
  x := private.close_execution(x.id, 'CANCELLED', 'USER_CANCELLED');   -- idempotente: terminal devolve o estado existente
  return private.execution_json(x);
end $$;
```

Demais funções (`logout`, `get_home`, `execution_json`, `finalize_account_deletion`) são escritas nas Fases 2–5 com testes. `execution_json` devolve `{id, task_code, kind, state, end_reason, started_at, ends_at, reconcile_until, duration_seconds, reward_points, server_now}`; `server_now` alimenta o relógio do cliente.

**Como o servidor conclui "sozinho" (D20) — e o limite honesto disso.** A conclusão é *dirigida por evidência gravada no servidor*. Ela acontece (a) dentro de qualquer RPC do cliente que traga um relato de mesma identidade recebido em/após `ends_at` — inclusive o *beacon* de segundo plano do Android, sem interação do usuário — e (b) no job `reconcile_due_executions`, que reprocessa a evidência já existente e expira as abandonadas. O servidor **não inventa evidência**: se nenhum relato chegou em/após o fim (caso típico do iOS suspenso), a execução fica `RUNNING` até chegar prova ou até `reconcile_until`.

### 0006 — auditoria e rate limit

```sql
create table public.audit_logs (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  event_type text not null check (event_type in (
    'AUTH_LOGIN_SUCCESS','AUTH_LOGIN_FAILED','AUTH_LOGOUT','ACCOUNT_CREATED','EMAIL_CONFIRMED',
    'PASSWORD_RESET_REQUESTED','PASSWORD_RESET_COMPLETED','ACCOUNT_RECOVERY_REQUESTED','ACCOUNT_RECOVERY_COMPLETED',
    'TASK_STARTED','TASK_COMPLETED','TASK_CANCELLED','TASK_INTERRUPTED',
    'POINTS_INITIALIZED','POINTS_CREDITED','POINTS_DEBITED',
    'ACCOUNT_DELETION_REQUESTED','ACCOUNT_DELETED','RATE_LIMIT_TRIGGERED','SECURITY_EVENT')),
  severity text not null default 'info' check (severity in ('info','warn','error')),
  account_id uuid,                                   -- sem FK: registros sobrevivem à exclusão
  subject_hash text,                                 -- HMAC(IP/e-mail) com pepper; nunca o valor cru
  details jsonb not null default '{}'::jsonb
);
create index audit_account_idx on public.audit_logs(account_id, occurred_at desc);
create index audit_type_idx    on public.audit_logs(event_type, occurred_at desc);
create trigger audit_immutable before update or delete on public.audit_logs
  for each row execute function private.ledger_immutable();

create function private.audit(p_type text, p_account uuid, p_sev text, p_details jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  -- defesa em profundidade: a primeira defesa é NUNCA passar segredos para cá
  if p_details::text ~* '(password|senha|token|secret|apikey|api_key|authorization|refresh)' then
    p_details := jsonb_build_object('redacted', true);
  end if;
  insert into public.audit_logs(event_type, account_id, severity, details) values (p_type, p_account, p_sev, p_details);
end $$;

create table public.rate_limit_counters (
  bucket text not null, subject text not null, window_start timestamptz not null, hits int not null default 0,
  primary key (bucket, subject, window_start)
);
create index rate_limit_window_idx on public.rate_limit_counters(window_start);

create function private.rate_limit_hit(p_bucket text, p_subject text, p_limit int, p_window_seconds int) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_ws timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds); v_hits int;
begin
  insert into public.rate_limit_counters as c(bucket, subject, window_start, hits) values (p_bucket, p_subject, v_ws, 1)
  on conflict (bucket, subject, window_start) do update set hits = c.hits + 1 returning hits into v_hits;
  if v_hits = p_limit + 1 then                       -- audita só a primeira ultrapassagem da janela
    perform private.audit('RATE_LIMIT_TRIGGERED', null, 'warn', jsonb_build_object('bucket', p_bucket));
  end if;
  return v_hits <= p_limit;
end $$;
-- Wrapper para Edge Functions (service role): public.rl_hit(...) com EXECUTE só para service_role.
```

### 0007 — recuperação e exclusão

```sql
create table public.recovery_requests (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id),
  token_hash bytea not null unique,                                   -- SHA-256 do token; o token só existe no e-mail
  status text not null check (status in ('PENDING','CONFIRMED','CONSUMED','EXPIRED','CANCELLED')),
  expires_at timestamptz not null,                                    -- [DECISÃO] link válido 30 min
  confirmed_at timestamptz, login_window_until timestamptz,           -- [DECISÃO] janela de 10 min após confirmar
  consumed_at timestamptz, created_at timestamptz not null default now()
);
create unique index one_open_recovery on public.recovery_requests(account_id) where status in ('PENDING','CONFIRMED');

create table public.deletion_requests (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id),
  token_hash bytea not null unique,
  status text not null check (status in ('PENDING','CONFIRMED','CANCELLED','EXPIRED')),
  expires_at timestamptz not null,
  confirmed_at timestamptz, created_at timestamptz not null default now()
);
create unique index one_open_deletion on public.deletion_requests(account_id) where status = 'PENDING';
```

### 0008 — triggers em `auth.users`

```sql
create function private.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_user text := new.raw_user_meta_data->>'username'; v_name text := btrim(coalesce(new.raw_user_meta_data->>'full_name',''));
begin
  if v_user is null or v_user !~ '^[A-Za-z0-9_-]{3,20}$' then raise exception 'invalid_username'; end if;
  if char_length(v_name) not between 1 and 80 then raise exception 'invalid_name'; end if;
  insert into public.accounts(id) values (new.id);
  perform private.claim_username(new.id, v_user);
  insert into public.profiles(account_id, full_name) values (new.id, v_name);
  perform private.audit('ACCOUNT_CREATED', new.id, 'info', '{}');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.handle_new_user();
-- user_metadata é editável pelo usuário depois do cadastro: NUNCA é relido como fonte de username/nome.

create function private.handle_email_confirmed() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.usernames u where u.account_id = new.id and u.state = 'RESERVED' and u.reserved_until < now()) then
    raise exception 'reservation_expired';           -- defesa em profundidade (link do e-mail também expira em ≤ 24 h)
  end if;
  update public.accounts set status = 'ACTIVE', activated_at = now() where id = new.id and status = 'PENDING_EMAIL';
  if found then
    update public.usernames set state = 'ACTIVE', reserved_until = null where account_id = new.id and state = 'RESERVED';
    perform private.post_ledger_entry(new.id, 'INITIAL_GRANT', private.initial_grant_points(), 'SYSTEM', null, null, 'initial:' || new.id::text);
    perform private.audit('EMAIL_CONFIRMED', new.id, 'info', '{}');
    perform private.audit('POINTS_INITIALIZED', new.id, 'info', '{}');
  end if;
  return new;
end $$;
create trigger on_auth_email_confirmed after update of email_confirmed_at on auth.users
  for each row when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function private.handle_email_confirmed();

-- PASSWORD_RESET_REQUESTED: after update of recovery_sent_at   → auditoria
-- PASSWORD_RESET_COMPLETED: after update of encrypted_password → auditoria + revoke_device_session(...,'PASSWORD_RESET')
```

### 0009 — RLS e grants (spec 45)

```sql
alter table public.accounts, public.profiles, public.usernames, public.device_sessions, public.task_definitions,
            public.task_executions, public.execution_events, public.points_balance, public.points_ledger,
            public.recovery_requests, public.deletion_requests, public.audit_logs, public.rate_limit_counters
  enable row level security;
alter table public.accounts, public.profiles, public.usernames, public.device_sessions, public.task_definitions,
            public.task_executions, public.execution_events, public.points_balance, public.points_ledger,
            public.recovery_requests, public.deletion_requests, public.audit_logs, public.rate_limit_counters
  force row level security;

-- Helper: a sessão do JWT é a sessão de dispositivo vigente E a conta está ativa
create function private.session_is_current() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.device_sessions ds join public.accounts a on a.id = ds.account_id
     where ds.account_id = (select auth.uid())
       and ds.auth_session_id = ((select auth.jwt())->>'session_id')::uuid
       and ds.revoked_at is null and ds.last_seen_at > now() - private.session_ttl()
       and a.status = 'ACTIVE') $$;
grant usage on schema private to authenticated;
grant execute on function private.session_is_current() to authenticated;

-- SOMENTE leitura do próprio dado. Nenhuma policy de INSERT/UPDATE/DELETE existe para o cliente.
create policy accounts_select_own   on public.accounts        for select to authenticated using (id = (select auth.uid()) and private.session_is_current());
create policy profiles_select_own   on public.profiles        for select to authenticated using (account_id = (select auth.uid()) and private.session_is_current());
create policy balance_select_own    on public.points_balance  for select to authenticated using (account_id = (select auth.uid()) and private.session_is_current());
create policy ledger_select_own     on public.points_ledger   for select to authenticated using (account_id = (select auth.uid()) and private.session_is_current());
create policy executions_select_own on public.task_executions for select to authenticated using (account_id = (select auth.uid()) and private.session_is_current());
create policy tasks_select_active   on public.task_definitions for select to authenticated using (active and private.session_is_current());
create policy usernames_select_own  on public.usernames       for select to authenticated using (account_id = (select auth.uid()) and private.session_is_current());
-- device_sessions, execution_events, recovery_requests, deletion_requests, audit_logs, rate_limit_counters, app_config:
-- RLS ligado e SEM policies → invisíveis ao cliente.

grant select on public.accounts, public.profiles, public.usernames, public.points_balance, public.points_ledger,
                public.task_executions, public.task_definitions to authenticated;

-- RPCs: só authenticated (a própria função reafirma sessão/conta)
revoke execute on all functions in schema public from public, anon;
grant  execute on function public.start_task, public.reconcile_task, public.cancel_task,
                          public.sync_active_execution, public.logout, public.get_home to authenticated;
```

Pontos de atenção:

- Usar `(select auth.uid())` evita reavaliação por linha (recomendação de performance do Supabase).
- Nomes de função com `SECURITY DEFINER` **sempre** com `set search_path = ''` e nomes totalmente qualificados.
- `anon` não tem acesso a nenhuma tabela nem RPC. Verificação de disponibilidade de username passa por Edge Function (com captcha e rate limit), não por RPC anônima.

### 0010 — seed

```sql
insert into public.task_definitions(code, name, timer_kind, duration_seconds, reward_points) values
  ('STUDY_NORMAL', 'Estudo',              'NORMAL', 1800, 100),
  ('STUDY_FOCUS',  'Estudo - Modo Foco',  'FOCUS',  1800, 200);
-- Valores temporários da economia experimental (spec 15 e 17): ajustar via migration, nunca no cliente.
```

## 4. Índices e restrições — resumo de garantias

| Garantia | Mecanismo |
|----------|-----------|
| Username único, case-insensitive | PK em `username_normalized` + CHECK de formato |
| Uma sessão de dispositivo viva por conta | índice único parcial `one_live_session_per_account` |
| Uma execução ativa por conta | índice único parcial `one_running_execution_per_account` |
| Um crédito inicial por conta | índice único parcial `one_initial_grant_per_account` |
| Uma recompensa por execução | índice único parcial `one_reward_per_execution` + `idempotency_key` UNIQUE + `reward_ledger_id` UNIQUE |
| Estados terminais imutáveis e sem mistura de motivos | trigger `task_execution_guard` + CHECKs `finished_iff_terminal`, `reward_iff_completed`, `state_reason_map` |
| Ledger/eventos/auditoria append-only | triggers de bloqueio + ausência de grants de escrita |
| Saldo == soma do ledger | mesma transação sob `FOR UPDATE` + `verify_balances()` nos testes |

## 5. Concorrência

- Login simultâneo em dois aparelhos: `pg_advisory_xact_lock` por conta no hook + índice único parcial → no máximo um vence.
- Duas reconciliações simultâneas (RPC × job × RPC): `SELECT ... FOR UPDATE` na execução; a segunda vê estado terminal e devolve o mesmo resultado; ledger com chave de idempotência → no máximo um crédito.
- Dois `start_task` simultâneos: lock consultivo por conta + índice único parcial.

## 6. Retenção e limpeza (job `sweep`)

- Reservas de username vencidas e contas `PENDING_EMAIL` sem username: remover conta órfã e usuário do Auth via API administrativa (Edge Function; a exclusão **não** é feita por SQL direto em `auth.users`).
- Execuções `RUNNING` com `reconcile_until` vencido → `EXPIRED` (D15, 7 dias após `ends_at`), feito por `reconcile_execution` (R6), chamado pelo job e por qualquer RPC.
- `rate_limit_counters` com janela > 24 h; sessões do Auth órfãs.
- Agendamento: `pg_cron` [SPIKE — confirmar habilitação no projeto]; fallback: cron externo (GitHub Actions) chamando a Edge Function com segredo.

## 7. Exclusão de conta (D05, spec 13–14)

`deletion-confirm` (Edge Function, service role) executa em uma transação SQL (`private.finalize_account_deletion`): interrompe execução ativa (`ACCOUNT_DELETED`), revoga sessão, marca `accounts.status='DELETED'`, `deleted_at=now()`, apaga `profiles`, converte o username em `RESTRICTED` com `restricted_until = now()+90 dias` (mantém `account_id` do tombstone), audita `ACCOUNT_DELETED`. Depois remove o usuário do Auth (e-mail desvinculado). **Ledger e saldo permanecem** ligados ao `account_id` técnico, sem nome/e-mail. Depois de 90 dias o nome volta a ser reivindicável (`claim_username` remove a restrição vencida). Para transferências futuras: `usernames.state='RESTRICTED'` + `restricted_until` fornecem "conta excluída, faltam N dias".

## 8. Consistência username × Auth (D04)

1. A reserva (24 h) nasce junto com o usuário do Auth na mesma transação (trigger); ou ambos existem ou nenhum.
2. O link de confirmação do Auth deve expirar em **≤ 24 h** (ajustar a expiração de OTP/e-mail no painel [SPIKE: confirmar valor máximo permitido]).
3. Reenvio de confirmação só dentro da janela da reserva; não a estende.
4. Se a reserva vence: `claim_username` pode entregar o nome a outro; o `handle_email_confirmed` recusa confirmar contas com reserva vencida; o `sweep` remove a conta órfã.

## 9. Fora do escopo da V1 (apenas previsto no modelo)

Transferências (`entry_type` novos + regra de 30 dias sobre `accounts.created_at`), loja, sorteio (o tombstone + ledger já sustentam), novos tipos de tarefa (`task_definitions` extensível), bloqueio de apps. Nada disso é implementado.
