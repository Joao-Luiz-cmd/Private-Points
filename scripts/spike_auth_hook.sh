#!/usr/bin/env bash
# Spike do Auth (Fase 2, passo 1) — PROVA que o hook atende a regra de produto, não só que "funciona".
# Requer: supabase CLI (Docker), psql, curl, jq.   STATUS: NÃO EXECUTADO (só `bash -n`).
# Saída: PASS/FAIL por asserção + observações brutas (Q1–Q3). Cole tudo em docs/spikes/auth-hook-spike.md.
set -uo pipefail
cd "$(dirname "$0")/.."

: "${DB_URL:=postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
eval "$(supabase status -o env 2>/dev/null | sed 's/^/export /')"      # nomes das variáveis podem variar por versão do CLI
API="${API_URL:-http://127.0.0.1:54321}"; KEY="${ANON_KEY:-${PUBLISHABLE_KEY:-}}"; ADMIN="${SERVICE_ROLE_KEY:-${SECRET_KEY:-}}"
[ -n "$KEY" ] && [ -n "$ADMIN" ] || { echo "Defina ANON_KEY/PUBLISHABLE_KEY e SERVICE_ROLE_KEY/SECRET_KEY (supabase status -o env)"; exit 1; }
H=(-H "apikey: $KEY" -H "Content-Type: application/json")
HA=(-H "apikey: $ADMIN" -H "Authorization: Bearer $ADMIN" -H "Content-Type: application/json")
PASS_PW="${SPIKE_PASSWORD:-Sp!$(date +%s)$RANDOM-Aa1}"; FAILS=0   # senha descartável gerada por execução (só para o Supabase LOCAL); nada fixo no repositório
q()    { psql "$DB_URL" -X -q -A -t -c "$1"; }
step() { printf '\n=== %s ===\n' "$1"; }
check(){ if [ "$2" = "$3" ]; then echo "PASS  $1 (obtido: $2)"; else echo "FAIL  $1 (esperado: $3 | obtido: $2)"; FAILS=$((FAILS+1)); fi; }
login(){ curl -s "${H[@]}" "$API/auth/v1/token?grant_type=password" -d "{\"email\":\"$1\",\"password\":\"$PASS_PW\"}"; }
refresh(){ curl -s "${H[@]}" "$API/auth/v1/token?grant_type=refresh_token" -d "{\"refresh_token\":\"$1\"}"; }
whoami(){ curl -s -o /dev/null -w '%{http_code}' -H "apikey: $KEY" -H "Authorization: Bearer $1" "$API/auth/v1/user"; }
mkuser(){ curl -s "${HA[@]}" "$API/auth/v1/admin/users" -d "{\"email\":\"$1\",\"password\":\"$PASS_PW\",\"email_confirm\":true}" | jq -r .id; }
sid_of(){ jq -R -r 'split(".")[1] | gsub("-";"+") | gsub("_";"/") | @base64d | fromjson | .session_id' <<<"$1"; }
live_count(){ q "select count(*) from spike.device_sessions where account_id='$1' and revoked_at is null"; }

step "0. Sonda (modo observe). O hook precisa estar HABILITADO (config.toml [auth.hook.custom_access_token]) e o stack reiniciado"
psql "$DB_URL" -X -q -f supabase/spike/001_hook_probe.sql && echo "sonda aplicada"

step "Q1/Q2 (cadastro real + confirmação por e-mail) — método e existência de auth.sessions"
E0="spike+q+$(date +%s)@example.test"
curl -s "${H[@]}" "$API/auth/v1/signup" -d "{\"email\":\"$E0\",\"password\":\"$PASS_PW\"}" | jq -c '{has_access_token:(.access_token!=null), user_id:(.id // .user.id), confirmed:(.email_confirmed_at // .user.email_confirmed_at)}'
echo ">> Confirme o e-mail (Mailpit/Inbucket: http://127.0.0.1:54324) e pressione Enter"; read -r _
R=$(login "$E0"); echo "login pós-confirmação: $(jq -c '{ok:(.access_token!=null), err:(.error_description // .msg)}' <<<"$R")"
RR=$(refresh "$(jq -r .refresh_token <<<"$R")"); echo "refresh: $(jq -c '{ok:(.access_token!=null)}' <<<"$RR")"
echo "Q1 (valores de authentication_method) e Q2 (session_row_exists) observados:"
q "select id, auth_method, session_row_exists, sessions_for_user, event_keys, claim_keys, decision from spike.hook_events order by id"

q "update spike.config set value='enforce' where key='mode'"

step "S1. A ativo -> B recusado -> A continua válido  (usuário U1)"
E1="spike+s1+$(date +%s)@example.test"; U1=$(mkuser "$E1")
A=$(login "$E1"); A_ACC=$(jq -r .access_token <<<"$A"); A_REF=$(jq -r .refresh_token <<<"$A"); A_SID=$(sid_of "$A_ACC")
check "S1.a login de A autorizado" "$(jq -r '.access_token!=null' <<<"$A")" "true"
check "S1.b A é a única sessão viva em device_sessions" "$(live_count "$U1")" "1"
for code in 403 401; do
  q "update spike.config set value='$code' where key='deny_code'"
  BEFORE=$(q "select count(*) from auth.sessions where user_id='$U1'")
  RESP=$(curl -s -o /tmp/spike_b_body -w '%{http_code}' "${H[@]}" "$API/auth/v1/token?grant_type=password" -d "{\"email\":\"$E1\",\"password\":\"$PASS_PW\"}")
  AFTER=$(q "select count(*) from auth.sessions where user_id='$U1'")
  echo "Q3 deny_code=$code -> HTTP $RESP, corpo=$(cat /tmp/spike_b_body) | auth.sessions antes=$BEFORE depois=$AFTER (depois>antes = SESSÃO ÓRFÃ criada)"
  check "S1.c B recusado (deny_code=$code): sem access_token" "$(jq -r '.access_token!=null' /tmp/spike_b_body 2>/dev/null)" "false"
  check "S1.d (deny_code=$code) nenhuma sessão órfã em auth.sessions" "$AFTER" "$BEFORE"
done
check "S1.e A continua a sessão viva em device_sessions" "$(q "select count(*) from spike.device_sessions where auth_session_id='$A_SID' and revoked_at is null")" "1"
A=$(refresh "$A_REF"); check "S1.f A ainda faz refresh (refresh tokens rotacionam: guardo o novo)" "$(jq -r '.access_token!=null' <<<"$A")" "true"
A_REF=$(jq -r .refresh_token <<<"$A"); A_ACC=$(jq -r .access_token <<<"$A")
check "S1.g token de A aceito em /user (HTTP)" "$(whoami "$A_ACC")" "200"

step "S2. 30 dias de inatividade -> login de B permitido  (usuário U1, continuação)"
q "update spike.device_sessions set last_seen_at = now() - interval '31 days' where auth_session_id='$A_SID'"
B=$(login "$E1"); B_ACC=$(jq -r .access_token <<<"$B"); B_REF=$(jq -r .refresh_token <<<"$B")
check "S2.a login de B permitido após 31 dias de inatividade de A" "$(jq -r '.access_token!=null' <<<"$B")" "true"
check "S2.b B é a sessão viva" "$(q "select count(*) from spike.device_sessions where auth_session_id='$(sid_of "$B_ACC")' and revoked_at is null")" "1"
check "S2.c A foi revogada por INACTIVITY_EXPIRED" "$(q "select revoke_reason from spike.device_sessions where auth_session_id='$A_SID'")" "INACTIVITY_EXPIRED"
check "S2.d refresh de A agora é negado" "$(jq -r '.access_token!=null' <<<"$(refresh "$A_REF")")" "false"

step "S3. Recovery: B conclui a recuperação -> A invalidado, B autorizado  (usuário U2)"
E2="spike+s3+$(date +%s)@example.test"; U2=$(mkuser "$E2")
A2=$(login "$E2"); A2_ACC=$(jq -r .access_token <<<"$A2"); A2_REF=$(jq -r .refresh_token <<<"$A2"); A2_SID=$(sid_of "$A2_ACC")
check "S3.a A autorizado" "$(jq -r '.access_token!=null' <<<"$A2")" "true"
check "S3.b B recusado ANTES da recuperação" "$(jq -r '.access_token!=null' <<<"$(login "$E2")")" "false"
q "insert into spike.recovery(account_id, window_until) values ('$U2', now() + interval '10 minutes') on conflict (account_id) do update set window_until=excluded.window_until, consumed_at=null"
B2=$(login "$E2"); B2_ACC=$(jq -r .access_token <<<"$B2"); B2_REF=$(jq -r .refresh_token <<<"$B2")
check "S3.c B autorizado após a janela de recuperação" "$(jq -r '.access_token!=null' <<<"$B2")" "true"
check "S3.d A revogada por ACCOUNT_RECOVERY" "$(q "select revoke_reason from spike.device_sessions where auth_session_id='$A2_SID'")" "ACCOUNT_RECOVERY"
check "S3.e B é a ÚNICA sessão viva" "$(live_count "$U2")" "1"
check "S3.f refresh de A negado" "$(jq -r '.access_token!=null' <<<"$(refresh "$A2_REF")")" "false"
check "S3.g refresh de B permitido" "$(jq -r '.access_token!=null' <<<"$(refresh "$B2_REF")")" "true"
check "S3.h janela de recuperação é de USO ÚNICO (3º login recusado)" "$(jq -r '.access_token!=null' <<<"$(login "$E2")")" "false"
echo "Q (efeito no Auth): a revogação por hook só marca device_sessions; o token de acesso de A vive até 'exp' mas RPC/RLS exigem sessão vigente. Aqui /user de A:"
echo "   HTTP $(whoami "$A2_ACC") (200 é esperado até expirar; o que importa é o hook negar o REFRESH e as RPCs checarem device_sessions)"

step "Q6. Reset de senha: método e sessão resultante"
curl -s "${H[@]}" "$API/auth/v1/recover" -d "{\"email\":\"$E0\"}" | jq -c .
echo ">> Abra o e-mail de recuperação, clique no link, e rode:"
echo "   psql \"$DB_URL\" -c \"select auth_method, decision, session_row_exists from spike.hook_events order by id desc limit 3\""

step "RESUMO"
q "select auth_method, count(*) from spike.hook_events group by 1 order by 2 desc"
echo "FALHAS: $FAILS  (0 = a regra de produto foi PROVADA para S1–S3; qualquer FAIL bloqueia a Fase 2)"
exit $FAILS
