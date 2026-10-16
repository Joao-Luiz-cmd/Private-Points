# Private Points — Segurança V1

> Legenda de confiança em [architecture.md](architecture.md). Modelo mental: **o cliente é ambiente hostil** (spec 58).

## 1. Fronteiras de confiança

| Elemento | Confiável? | Uso permitido |
|---|---|---|
| Servidor (Postgres, RPCs `SECURITY DEFINER`, Edge Functions) | Sim | Autoridade única de saldo, recompensa, validade, sessão, tempo |
| JWT do Supabase (assinado) | Sim, para identidade | `auth.uid()`, `session_id`; **nunca** para dados mutáveis pelo usuário (`user_metadata`) |
| App instalado (código JS/nativo) | **Não** | UI, coleta de sinais, cache |
| Relógio, armazenamento, timers JS, saldo local | **Não** | Renderização e UX |
| Sinais de lifecycle reportados pelo cliente | **Sinal, não autoridade** | Evidência gravada com `received_at` do servidor; nenhum evento isolado basta; combinado com tempo do servidor, identidade de processo/boot e coerência monotônica (timers.md §7) |

## 2. Matriz de ameaças e controles

| Ameaça | Controle | Camada |
|---|---|---|
| "Me dê 200 Points" forjado | Nenhuma tabela aceita escrita do cliente; crédito só em `reconcile_execution` → `credit_execution` → `post_ledger_entry` (nenhuma RPC afirma conclusão) | RLS/grants + RPC |
| Replay de conclusão | `idempotency_key = 'reward:'||execution_id` UNIQUE + índice de recompensa única + estado terminal imutável | Banco |
| Cliente forja "concluí" | Não existe RPC que afirme conclusão e o payload é **lista branca estrita**: `completed`, `reward`, `points`, `state`… são rejeitados. O servidor só credita se **todas** valerem: tempo do servidor ≥ `ends_at`; relato de mesma identidade (processo+boot) **recebido** em/após `ends_at`; nenhuma violação; sessão vigente; ledger sem crédito prévio | RPC `reconcile_execution` |
| Cliente tenta reverter `UNVERIFIED → COMPLETED` | Estados terminais imutáveis (trigger + retorno antecipado + `WHERE state='RUNNING'` + ledger único). Sem transição de reconciliação na V1 (timers.md §2.1) | Banco |
| Duas execuções simultâneas | Índice único parcial + lock consultivo | Banco |
| Acesso a dados de outro usuário (IDs/REST) | RLS `account_id = auth.uid()` + `session_is_current()`; RPCs filtram por `auth.uid()` | Banco |
| Manipular relógio / fuso / modo avião | Decisão só pelo relógio do **servidor** (`received_at`, `ends_at`) + identidade de processo/boot. O relógio de parede do aparelho não entra em decisão; o monotônico só mede tempo local (UI/agendamento) e **não** valida conclusão (timers.md §1.1) | Servidor |
| Restaurar estado local antigo | Estado local não é autoridade; servidor decide pela linha `task_executions` | Servidor |
| Segundo dispositivo assumindo a conta | Hook nega login com sessão viva; RPC/RLS exigem `session_id` vigente | Auth + Banco |
| Enumeração de contas | Ver §6 | Auth + Edge |
| Bots no cadastro | Turnstile + rate limit + validação server-side (§4–5) | Auth + Edge |
| Força bruta de senha | Captcha no Auth, limites por IP do Auth, limites por e-mail no `auth-login`; **limitação do Free** (§9) | Auth + Edge |
| Segredos no app | Somente `SUPABASE_URL` e chave `anon/publishable` no cliente; service role só nas Edge Functions | Build/Deploy |
| Log vazando dados | Lista de proibições + `private.audit` com redação defensiva (§8) | Banco/Edge |
| Link de e-mail consumido por scanner | Confirmação por botão POST; token de uso único; hash em tabela | Edge + Netlify |

## 3. Sessão única (D03, D10-B)

- Autoridade: tabela `device_sessions` + **Custom Access Token Hook** (Free e Pro [DOC]) + `require_session()` em toda RPC + `session_is_current()` nas policies.
- Refresh de token: só a sessão vigente renova; qualquer outra recebe negação no hook, e o cliente faz sign-out.
- A revogação tem efeito **imediato** para dados (RPC/RLS), mesmo que o access token antigo ainda não tenha expirado. Só o *token* em si vive até o `exp`; ele não dá acesso a nada porque as policies/RPCs conferem a sessão.
- Expiração: 30 dias sem `last_seen_at` (renovado por refresh e por RPC, com atualização limitada a cada 10 min).
- Substituição só por: logout, expiração (após 30 dias, D17: outro dispositivo pode fazer **login normal**), **Recuperar conta** (janela confirmada por e-mail), reset de senha concluído (**revoga a sessão vigente**, D18), exclusão de conta.
- Válvula de emergência: `app_config.session_hook_enabled=false` desliga o bloqueio (R4). Uso registrado como `SECURITY_EVENT`.

## 4. Anti-bot (D06)

Camadas (nenhuma sozinha basta):

1. **Turnstile** em signup, login e reset de senha, validado **pelo próprio Auth** (captcha ativado no painel; o `captchaToken` viaja em `options`). Ligar no Auth é o que vale contra chamadas diretas à API pública (a chave anon é pública por natureza).
2. **Widget** em WebView carregando página nossa (Netlify), com o domínio na allowlist do Turnstile. Não usar relay de terceiros. Tokens expiram em minutos e são de uso único: pedir novo a cada tentativa.
3. **Rate limiting** (§5).
4. **Validação server-side** de username/nome no trigger; o cliente nunca é o único validador.
5. Fricção proporcional: reenvio de confirmação com intervalo mínimo e teto diário.

Limitação assumida: o Turnstile não tem SDK móvel nativo; uma WebView é a integração suportada [DOC]. Para chamadas às Edge Functions próprias (recuperação, exclusão, checagem de username) a função valida o token na API `siteverify` do Cloudflare com o segredo do servidor.

## 5. Rate limiting

Limites **técnicos iniciais** (configuráveis; não são regra de negócio). Onde o Auth já limita (IP, configurável no painel [DOC]), reaproveitamos; o resto é do `rate_limit_hit`.

| Bucket | Sujeito | Limite | Onde |
|---|---|---|---|
| signup / signin / reset / resend (Auth) | IP | valores do painel do Auth | Auth |
| `login_email` | HMAC(e-mail) | 8 falhas / 15 min | `auth-login` |
| `login_ip` | HMAC(IP) | 30 / 15 min | `auth-login` |
| `username_check` | HMAC(IP) | 30 / 10 min | Edge |
| `recovery_request` | HMAC(IP) e conta | 5 / hora | Edge |
| `deletion_request` | conta | 3 / dia | Edge |
| `resend_confirmation` | HMAC(e-mail) | 1 / 60 s, 5 / dia | Edge |
| `start_task` | conta | 10 / min | RPC |
| `reconcile_task` / `sync_active_execution` | conta | 30 / min | RPC |

Sujeitos são sempre **HMAC com pepper de servidor**, nunca IP/e-mail cru. Estouro gera `RATE_LIMIT_TRIGGERED` (uma vez por janela). Resposta ao cliente é genérica e idêntica para existência/inexistência de conta.

## 6. Enumeração de contas

- Login: mensagem única ("credenciais inválidas ou acesso não autorizado") para e-mail inexistente, senha errada e sessão bloqueada. *Observação:* o bloqueio por sessão viva só ocorre **após senha correta**, portanto só quem já tem a credencial percebe a diferença.
- Reset de senha e reenvio: resposta neutra sempre ("se existir uma conta, enviaremos…").
- Recuperar conta: qualquer divergência entre username/e-mail/senha → mesma resposta neutra e mesmo tempo de resposta aproximado.
- Cadastro com e-mail já existente: comportamento neutro do Auth com confirmação obrigatória.
- Username: a disponibilidade é revelável por definição do produto (transferências por username no futuro). Mitigação: captcha + rate limit em `username-check`. O e-mail **nunca** é público.

## 7. Recuperar conta e exclusão

**Recuperar conta** (server-side, spec 12):
1. Edge Function `recovery-request` (captcha + rate limit): localiza a conta pelo username, compara e-mail, **verifica a senha sem criar sessão** [SPIKE R8: `crypt()` em função definer contra `auth.users.encrypted_password`, com fallback de pedir a senha no passo final]. Qualquer falha → resposta neutra.
2. Cria `recovery_requests(PENDING)` com token aleatório de 256 bits; grava **apenas o SHA-256**; e-mail com link para página nossa.
3. Página mostra botão "Confirmar neste dispositivo" (POST) → `recovery-confirm` marca `CONFIRMED` e abre janela de login de 10 min.
4. O novo dispositivo faz o login normal; o hook revoga a sessão antiga, autoriza a nova e consome a solicitação (uso único).
A senha não é armazenada nem registrada em nenhum ponto; trafega apenas por TLS até o Auth/função.

**Exclusão** (spec 13): pedido autenticado → e-mail com link → botão POST → `deletion-confirm`. Só o link efetiva. Antes da confirmação o app mostra os seis avisos exigidos (e-mail desvinculado, conta deixa de existir, Points para o futuro sorteio, escolha futura do nome no sorteio, sorteio definido depois, username restrito por 90 dias).

## 8. Logs e privacidade

- **Nunca registrar:** senha, tokens (JWT, refresh, links), códigos de recuperação, segredos, chaves, IP cru, e-mail cru.
- `audit_logs.details` recebe apenas identificadores técnicos e códigos de motivo. `private.audit` redige defensivamente valores suspeitos.
- Auditoria é append-only e sem acesso do cliente. Telemetria de erro no app não inclui corpo de requisições de autenticação.
- Eventos exigidos pela spec e origem: `AUTH_LOGIN_SUCCESS` (hook), `AUTH_LOGIN_FAILED` (`auth-login`), `AUTH_LOGOUT` (RPC `logout`), `ACCOUNT_CREATED`/`EMAIL_CONFIRMED`/`POINTS_INITIALIZED` (triggers), `PASSWORD_RESET_*` (triggers em `auth.users`), `ACCOUNT_RECOVERY_*` (Edge/hook), `TASK_*` e `POINTS_*` (RPCs), `ACCOUNT_DELETION_REQUESTED`/`ACCOUNT_DELETED` (Edge), `RATE_LIMIT_TRIGGERED`, `SECURITY_EVENT`.
- Mensagens de erro ao usuário: sem stack, SQL, IDs internos ou detalhe que ajude o abuso (spec 60). Códigos de erro internos ficam nos logs.

## 9. Riscos residuais (explícitos)

1. **Sem lockout por conta no endpoint nativo do Auth (plano Free).** O hook de verificação de senha é recurso de planos superiores [DOC]. Mitigações: captcha obrigatório no Auth, limites por IP do Auth, e `auth-login` com limite por e-mail. Um atacante que ignore o `auth-login` e bata direto no Auth continua limitado apenas por captcha + IP. Aceito na V1; reavaliar no Pro.
2. **Cliente comprometido (root/jailbreak, app modificado, script)** pode reportar lifecycle falso e obter recompensa. **A V1 ainda não tem atestação.** Decisão arquitetural preliminar (03/10/2026): **atestação (Play Integrity / App Attest) como camada adicional**, em investigação no [spike](spikes/attestation-spike.md); até a aprovação da arquitetura definitiva este risco permanece **aberto**. A atestação não prova que o usuário estudou nem presença humana.
3. **Tolerância de chamada (D01):** o servidor considera compatível uma ausência com `CALL_STARTED` ativo. Um cliente comprometido pode **fabricar** esse sinal; mesmo um usuário honesto poderia manter a chamada aberta e usar outro app (indetectável principalmente no iOS). Sem janela artificial, por decisão do produto.
4. **Evidência de saída de processo no Android** usa timestamp de relógio de parede do aparelho; um usuário que altere o relógio antes de encerrar o app poderia forjar "saiu depois do fim". Custo-benefício aceito na V1.
5. **iOS:** ver timers.md §8 (casos indistinguíveis). Onde o iOS não fornece o sinal de bloqueio de tela (ex.: aparelho sem passcode), o Modo Foco perde a recompensa se a tela for bloqueada (`UNVERIFIED`) — aceito por D16 em favor de não abrir brecha.
7. **Servidor só credita com evidência:** no iOS suspenso não chega evidência em/após `ends_at` até o app voltar a rodar; a execução aguarda até 7 dias (D15) e então expira. Não é falha de segurança, é limite da plataforma.
8. **Evidência de Modo Foco é produzida pelo cliente.** O servidor classifica as ausências (não existe `cause` do cliente), mas parte de sinais brutos que um cliente comprometido pode **omitir** (nunca reportar o `BACKGROUND`) ou **fabricar** (`SCREEN_LOCKED`/`CALL_STARTED` coerentes). Só atestação de integridade reduz isso (docs/beacon-analysis.md).
6. **Free pausa por inatividade / sem backup baixável** (architecture.md §3.2): disponibilidade e recuperação de desastre de produção dependem de Pro.

## 10. Segredos e ambientes

| Segredo | Onde vive | Nunca em |
|---|---|---|
| `service_role`/secret key | Secrets das Edge Functions; CI (variáveis protegidas) | app, repositório, logs |
| Segredo Turnstile | Painel do Auth + secrets das Edge Functions | app |
| Pepper de HMAC | Secrets das Edge Functions | app |
| Credenciais SMTP/API de e-mail | Painel do Auth / secrets | app |
| `SUPABASE_URL`, chave publishable/anon, site key Turnstile | `app.config.ts` por ambiente (públicos por design) | — |

Ambientes: **local** (Supabase CLI), **staging**, **produção**, cada um com projeto/segredos próprios. `.env*` no `.gitignore`; varredura de segredos no CI (Fase 8).

## 11. Requisitos de teste de segurança (Fase 9)

Acesso cruzado entre usuários via REST/RPC; escrita direta em `points_ledger`/`points_balance`/`task_executions` (deve falhar); alterar `execution_id`/`account_id`; replay e concorrência de `reconcile_task`/job; tentativa de forjar `HEARTBEAT` com identidade errada, relógio incoerente ou evento antes de `ends_at` (não pode gerar crédito); execução vencida após 7 dias (deve virar `EXPIRED` e não creditar mais); duas `start_task` paralelas; login paralelo em dois aparelhos; token de sessão revogada; rate limit por bucket; expiração de reserva de username; token de recuperação reutilizado/expirado; garantia de que nenhum log contém senha/token.


## 12. Contrato cliente → servidor para recompensa (normativo)

**Fluxo obrigatório:** `evidência → reconciliação server-side → validação → crédito idempotente`. **Nunca:** `cliente → decisão → servidor executa`.

1. O cliente **nunca** envia `completed`, `reward`, `points`, `state`, `end_reason`, quantidade de Points, autorização de crédito **nem equivalentes** (`should_credit`, `success`, `completion_status`, `verdict`, `is_valid`, `eligible`, `outcome`, `final_state`…).
2. O cliente envia **eventos/evidências**: `event_type` (observação bruta), `client_mono_ms`, `process_instance_id`, `boot_id`, telemetria `process_exit{at,kind}`. **Sem `cause`/classificação.**
3. O servidor determina a validade por `reconcile_execution` e só então chama `credit_execution` (idempotente, transação atômica, uma recompensa por execução, relê a linha sob lock e exige `RUNNING`).
4. **Imposição em camadas** (a defesa não é uma lista de strings proibidas):
   - **Allowlist estrita** da forma do payload no cliente (`assertReconcilePayloadShape`) e no servidor (`private.ingest_events`: qualquer chave fora de `event_type, client_mono_ms, process_instance_id, boot_id, process_exit` ⇒ `invalid_event_field` (inclui `cause`, `reason`, `kind`, `source`, `status`, `type`…); `process_exit` só com `at`/`kind`; `boot_id` ≤ 128; `details` ≤ 512 bytes).
   - **Tripwire por radicais** (`looksLikeAuthorityKey`) como segunda rede — com teste de que nenhuma chave permitida o dispara.
   - **Nenhuma RPC tem parâmetro de conclusão**; `reconcile_task(p_execution_id, p_events)`.
   - **Invariante no banco:** constraint trigger diferido em `points_ledger` — um `TASK_REWARD` só existe ao fim da transação se a execução referenciada estiver `COMPLETED`, da mesma conta, com o mesmo ledger e valor.
   - RLS sem escrita do cliente; `credit_execution` só é chamada por `reconcile_execution`.

### 12.1 Autoridade de cada campo — três categorias (D26)

Busca textual em RPCs, eventos, colunas e TypeScript por `cause`, `reason`, `type`, `source`, `kind`, `event_kind`, `status` e equivalentes. **Correção aplicada:** `cause` (classificação feita pelo cliente que podia tornar uma saída "tolerada") **foi removido**; o servidor classifica a partir de sinais brutos (`private.absence_verdict`).

**(1) Dados puramente INFORMATIVOS** (nenhuma regra os lê para decidir):

| Campo | Observação |
|---|---|
| `process_exit.at`, `process_exit.kind` | telemetria do Android; relógio de parede; não decide nada |
| `p_idempotency_key` | só evita duplicar `start` (escopada por conta) |
| `device_sessions.platform`, `app_version` | informativos |

**(2) EVIDÊNCIAS usadas pelo servidor** (entram nas regras, mas **não** decidem sozinhas; todas forjáveis por cliente comprometido):

| Campo | Papel como evidência | Tratamento no servidor |
|---|---|---|
| `event_type` (observação bruta: `HEARTBEAT`, `BACKGROUND`, `SCREEN_LOCKED`, `CALL_STARTED`/`ENDED`, `CHANNEL_*_OBSERVABLE`, `LEAVE_*`…) | o que o SO mostrou ao app | lista fechada; `STARTED` é exclusivo do servidor; **significado atribuído pelo servidor** |
| `client_mono_ms` | ordena/situa eventos no tempo decorrido local | limitado por `received_at` (`least(...)`); nunca comparado a timestamp absoluto |
| `process_instance_id`, `boot_id` (e `p_process_instance_id`, `p_boot_id`, `p_monotonic_ms` no `start`) | **sinais** de continuidade/consistência | só igualdade entre duas asserções do cliente |
| `p_events` / `p_execution_id` / `p_task_code` | lote de sinais / seletores de entidades **do servidor** | `p_task_code` só escolhe qual definição (duração e recompensa vêm de `task_definitions`) |

**(3) Decisões EXCLUSIVAMENTE do servidor** (nenhum parâmetro do cliente as atinge; sem política de escrita em RLS):

`task_executions.state`, `end_reason`, `reward_points`, `ends_at`, `reconcile_until`, `started_at`, `finished_at`, `reward_ledger_id`; `execution_events.received_at`; o **veredito de ausência** (`OK`/`LEFT_APP`/`UNATTRIBUTED`); `points_ledger.entry_type`, `source`, `status`, `reference_type`, `amount`, `balance_after`, `idempotency_key`; `points_balance`; `audit_logs.event_type`/`severity`; `accounts.status`; `usernames.state`; `device_sessions.revoke_reason`; `recovery_requests.status`; `deletion_requests.status`.

`cancel_task` é pedido do usuário que só pode **reduzir** ganhos (`CANCELLED`). Resultado da busca por nomes equivalentes (`should_credit`, `success`, `completion_status`, `verdict`, `eligible`, `outcome`…): **nenhum campo enviado pelo cliente**; as ocorrências são rótulos internos do servidor ou estado de UI local (`PENDING_VERDICT`, não enviado).

### 12.3 O que `COMPLETED` significa (V1)

> `COMPLETED` na V1 significa: **o servidor aceitou a evidência disponível como suficiente, segundo as regras da V1, para creditar aquela execução.** Não significa que o servidor provou criptograficamente que o usuário permaneceu fisicamente no Modo Foco durante todo o período.

Linguagem proibida nos documentos e no código: tratar `process_instance_id`, `boot_id`, relógio monotônico ou beacon como "prova" contra um cliente comprometido. São **sinais de continuidade e consistência**.

### 12.2 Caminhos para `UNVERIFIED → COMPLETED/RUNNING` ou crédito em execução `UNVERIFIED` (auditoria)

Busca em todo o SQL de referência, migrations e TypeScript: **nenhum caminho encontrado**. Todos os `UPDATE` em `task_executions` são: `close_execution` (`WHERE state='RUNNING'`), `credit_execution` (relê sob lock, exige `RUNNING`, `WHERE state='RUNNING'`), `revoke_device_session` (`WHERE state='RUNNING'`) e o trigger `task_execution_guard` (rejeita `UPDATE`/`DELETE` quando o estado antigo ≠ `RUNNING`). Crédito: único ponto é `credit_execution`; o ledger tem índice único por execução e o **constraint trigger** impede `TASK_REWARD` sem execução `COMPLETED`. No cliente, as duas máquinas lançam erro para qualquer sinal em `UNVERIFIED` exceto repetir o mesmo veredito (testado exaustivamente). **Status:** verificado por **leitura/busca textual e testes de lógica**; **NÃO VERIFICADO em PostgreSQL real** (os triggers e constraints nunca executaram).
