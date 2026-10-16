-- Private Points V1 · migration proposta em docs/database.md (revisão 2).
-- STATUS: NÃO executada em um Postgres real nesta etapa; validar com `supabase db reset` (Fase 2) e testes pgTAP.

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
