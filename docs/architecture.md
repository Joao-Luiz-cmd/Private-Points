# Private Points — Arquitetura V1

> **Status:** revisão 4 — decisões D01–D28; gate técnico da Fase 1 em [phase1-gate.md](phase1-gate.md).
> **Fonte da verdade funcional:** especificação CLAUDE-V1.0 + decisões oficiais D01–D22 (seção 2).
> **Documentos irmãos:** [database.md](database.md) · [security.md](security.md) · [timers.md](timers.md) · [consistency-review.md](consistency-review.md)

Legenda de confiança usada nos quatro documentos:

- **[DOC]** confirmado na documentação oficial consultada em 29/09/2026.
- **[SPIKE]** API pública do sistema operacional que conheço, mas que **ainda não foi exercitada em dispositivo real**; exige spike antes de consolidar (ver seção 9).
- **[DECISÃO]** escolha de implementação minha, sem efeito visível na regra de negócio; reversível.

---

## 1. Princípios

1. **O cliente nunca é autoridade para conceder Points (D20).** O servidor é a autoridade para saldo, recompensa, validade da execução, identidade, permissões, sessão e tempo, e **pode concluir e recompensar sozinho** quando houver evidência server-side suficiente. O cliente é UI + cache + coletor de **sinais** (lifecycle, continuidade); sinais não são autoridade e **nenhum evento isolado basta** para fabricar uma conclusão.
2. **Regra de negócio separada de plataforma.** O domínio (TypeScript puro) define estados e transições; adaptadores nativos apenas *emitem sinais tipados*.
3. **Duas máquinas de comportamento** (Timer Normal e Modo Foco) sobre infraestrutura comum (relógio, persistência, sincronização, ledger). Nunca `isFocusMode`.
4. **Conservadorismo contra recompensa indevida** quando a plataforma não permite provar continuidade (D11, D16). Perder uma recompensa em um caso tecnicamente indistinguível é preferível a abrir brecha para completar sem cumprir a regra. Continuidade não verificável **nunca** gera Points.
5. **Nada de capacidade inventada.** Onde o SO não oferece um evento, o documento diz isso e o sistema degrada para o comportamento máximo permitido.

---

## 2. Decisões oficiais registradas (parte da especificação V1)

| ID | Decisão | Onde é aplicada |
|----|---------|-----------------|
| D01 | Ligação, por si só, **não** cancela o Modo Foco. Sem janela arbitrária de 60 s. Ao voltar, avalia-se lifecycle real e validade da execução. | timers.md §5, §7 |
| D02 | iOS: distinção bloqueio de tela × saída do app em regime **melhor esforço**; limitações documentadas. | timers.md §6–7 |
| D03 | Sessão única expira após **30 dias de inatividade**; conta continua; outro dispositivo pode usar Recuperar conta. Lógica server-side. | database.md §4, security.md §3 |
| D04 | Username de conta não confirmada reservado por **24 h**; liberação consistente com o estado do Auth. | database.md §3, §8 |
| D05 | Na exclusão, Points permanecem no ledger; nome e e-mail **não** permanecem associados. `account_id` técnico preservado. | database.md §3, §9 |
| D06 | **Cloudflare Turnstile** + rate limiting + proteção server-side (nunca só cliente). | security.md §4–5 |
| D07 | **Expo + Development Build/Dev Client + config plugins/módulos nativos**; Expo Go não é requisito. | seção 4 |
| D08 | **Uma** execução ativa por usuário, imposta no backend (índice único parcial). | database.md §5 |
| D09 | **Sem janela de resgate**. Recompensa pertence à execução validamente concluída; resgate idempotente a qualquer momento. Nada de recompensa se cancelada/interrompida/invalidada/expirada. | timers.md §8 |
| D10 | Sessão única: comparação A (nativo) × B (própria) feita nesta etapa; **B escolhida** (seção 3). | seção 3 |
| D11 | Cold start **não** é prova absoluta; `process_instance_id`/`boot_id` são **sinais** de continuidade, **não** mecanismos de segurança contra cliente hostil; estratégia conservadora e documentada para o que o iOS não distingue. | timers.md §7 |
| D12 | Máquinas de estado separadas para Timer Normal e Modo Foco. | timers.md §3–4 |
| D13 | Servidor autoridade de recompensa, saldo e validade; idempotência; RLS; transações atômicas. | database.md, security.md |
| D14 | Ordem de trabalho: 4 docs → revisão de consistência → Fase 1. Parar e perguntar se surgir decisão que altere regra de negócio. | consistency-review.md |
| D15 | **EXPIRED após 7 dias** do término previsto. É prazo de **reconciliação/higiene**, *não* janela de resgate: não há exigência de abrir o app em X minutos; depois de 7 dias sem conclusão válida a execução vira `EXPIRED` e **nunca** gera Points. | database §0005 (R6), timers §7 |
| D16 | **Modo Foco no iOS sem passcode obrigatório**: bloquear/apagar tela é permitido; Home/troca voluntária invalida **quando detectável**; evento indistinguível → conservador (continuidade não verificável, **sem Points**). Sem mecanismos artificiais. | timers §6 |
| D17 | Após 30 dias de inatividade, **login normal** de outro dispositivo é aceito; Recuperar conta continua existindo. | database §0003 |
| D18 | Reset de senha concluído **revoga** a sessão de dispositivo vigente. | database §0003, §0008 |
| D19 | 1.000 Points iniciais **somente após confirmar o e-mail**, de forma **idempotente** (duas camadas). | database §0004, §0008 |
| D20 | Regra de autoridade: "**o cliente nunca é autoridade para conceder Points**"; servidor reconcilia por evidência e pode creditar sozinho; cliente envia sinais. | seção 1, database (reconcile), timers §7 |
| D21 | **Timer Normal funciona em background**; a arquitetura não exige app em primeiro plano para a recompensa ser válida (timestamps do servidor + estado da execução + sinais de continuidade + mecanismos de cada plataforma). | timers §3, §7 |
| D23 | `UNVERIFIED` aprovado como estado próprio; é **terminal e imutável**: nenhuma requisição do cliente o transforma em `COMPLETED`. Reconciliação posterior só por transição explícita, server-side, com nova evidência (inexistente na V1). | database §0005, timers §2.1 |
| D28 | **Atestação (opção C) — decisão arquitetural PRELIMINAR (03/10/2026).** A (manter) **não é aceitável** como solução final de integridade dos Points; B (heartbeats) **não** é mecanismo de segurança da economia. C será investigada em spike: Play Integrity (Android) e App Attest (iOS), integração Expo, validação server-side, vínculo conta/sessão/execução, replay, expiração, nonce/challenge, rotação e comportamento sem atestação. **Atestação não prova que o usuário estudou** e é **camada adicional** (não substitui relógio do servidor, classificação server-side, `UNVERIFIED`, idempotência, sessão única…). **Não está decidido** que `sem atestação ⇒ UNVERIFIED`; implementação pendente do spike. Economia e regras dos timers inalteradas. | [spikes/attestation-spike.md](spikes/attestation-spike.md), beacon-analysis |
| D27 | `COMPLETED` na V1 = o servidor **aceitou a evidência disponível como suficiente segundo as regras da V1**; **não** é prova criptográfica de permanência. Identificadores, monotônico e beacon são **sinais de continuidade e consistência**, não provas contra cliente comprometido. | timers §2.2, security §12.3 |
| D24 | **Relógios:** a calibração é **estimativa operacional, não prova de honestidade do cliente**; `server_now` é a autoridade; relógio de parede do aparelho não é autoridade; o monotônico mede tempo decorrido **local**, nunca é comparado com timestamp absoluto do servidor e só se correlaciona por **amostra de calibração** (RTT/2) com tolerâncias documentadas. O servidor **não** usa o monotônico para validar conclusão (removida a regra `CLOCK_INCOHERENT`). | timers §1.1 |
| D26 | **O cliente não classifica ausências.** Ele reporta observações brutas (`BACKGROUND`, `SCREEN_LOCKED`, `CALL_STARTED`, `CHANNEL_*`); o servidor correlaciona e decide (`private.absence_verdict`). Se não for possível atribuir com segurança ⇒ `UNVERIFIED`. Comportamento resultante idêntico ao anterior (D01/D16). | timers §6, security §12.1 |
| D25 | **SMTP e Turnstile por abstração**: provedor de e-mail via interface + configuração; captcha via interface cuja página hospedada vem de configuração (sem domínio/segredo no código). | seção 11 |
| D22 | Estados **não se misturam**: COMPLETED, INTERRUPTED, CANCELLED, EXPIRED, FAILED e continuidade não verificável (estado `UNVERIFIED`) têm definição e motivos próprios. | database `state_reason_map`, timers §2 |

---

## 3. Supabase: verificação na documentação oficial (D10)

Fontes consultadas: `supabase.com/docs/guides/auth/sessions`, `.../auth/auth-hooks`, `.../auth/auth-captcha`, `.../deployment/going-into-prod`.

### 3.1 Sessão única — A (nativo) × B (própria)

| Critério | A) "Enforce single session per user" | B) `device_sessions` + Custom Access Token Hook + RPC/RLS |
|---|---|---|
| Plano | **Pro ou superior** [DOC] | **Free e Pro** — o Custom Access Token Hook consta como disponível em Free e Pro [DOC] |
| Semântica | Mantém apenas a sessão **mais recentemente ativa** [DOC] → um novo login *expulsa* o dispositivo antigo | Permite **negar** o novo login enquanto a sessão antiga estiver viva (exatamente a spec, seção 10: "Dispositivo B: NÃO AUTORIZADO") |
| Latência de efeito | Verificada quando a sessão é renovada; efeito perceptível em intervalos do tempo de expiração do JWT [DOC] | Imediata nas RPCs/RLS (cada chamada confere a sessão); no refresh de token, negada no hook |
| Expiração por inatividade de 30 dias | Existe "inactivity timeout" no Auth, mas também é recurso de plano pago [DOC: seção de limites de sessão é "Pro e acima"] | Coluna `last_seen_at` + regra no hook (D03) |
| Recuperação de conta (revogar A e autorizar B) | Não modelável (só "o mais recente vence") | Modelável (janela de login autorizada por link de e-mail) |

**Conclusão:** o mecanismo nativo **não implementa a regra de negócio** (inverte o comportamento) e custa Pro. **Escolha: B.** Não há razão técnica para Pro por causa de sessão única.

### 3.2 Limitações do plano Free que afetam o projeto (documentadas antes de prosseguir)

1. **Pausa após 7 dias de baixa atividade** [DOC]. Para produção real isso é inviável; Pro garante que não pausa [DOC].
2. **Sem backups baixáveis** no Free [DOC].
3. **E-mail:** o SMTP embutido tem limite muito baixo (na prática, poucos e-mails por hora) e o próprio guia de produção manda usar SMTP próprio; com SMTP próprio o limite padrão citado é **30 novos usuários/hora**, ajustável [DOC]. → **É necessário um provedor SMTP transacional já no desenvolvimento** (custo baixo ou nulo em planos gratuitos do provedor; escolha pendente, não afeta regra).
4. **Dois projetos Free ativos por conta** (informação de guias de mercado, não da doc oficial; confirmar no painel). A spec pede ambientes dev/teste/produção → proposta: **dev local via Supabase CLI (Docker)**, **1 projeto hospedado de staging**, **1 projeto de produção**.
5. Hooks: há relatos antigos de erro ao configurar hooks no Free; a doc atual lista Free como suportado. **[SPIKE]** confirmar no projeto real na Fase 2.
6. Hooks têm limite de tempo curto: a função do hook deve ser mínima e indexada.

### 3.3 Anti-bot [DOC]

O Auth suporta **hCaptcha e Cloudflare Turnstile** e permite protegê-los em *sign-in, sign-up e reset de senha*; o token vai em `options.captchaToken`. O Turnstile **não tem SDK móvel nativo** → widget renderizado em `react-native-webview`. Pacotes de terceiros usam um domínio-relay do autor; **não usaremos**: hospedaremos uma página mínima do widget em domínio nosso (Netlify — uso permitido pela spec: página web complementar) e a WebView carrega essa página. Ver security.md §4.

---

## 4. Validação Expo (D07)

Confirmado na documentação [DOC]: Development Builds aceitam código nativo customizado; *config plugins* alteram `AndroidManifest.xml`/`Info.plist` via `prebuild` (CNG); o **Expo Modules API** (Kotlin/Swift) é o caminho recomendado para módulos nativos locais.

Mapeamento dos requisitos nativos → mecanismo (o módulo local proposto se chama `pp-platform`):

| Necessidade | Android | iOS | Como entra no Expo | Confiança |
|---|---|---|---|---|
| Sinais de lifecycle (foreground/background) | `AppState` + `ProcessLifecycleOwner` | `AppState` | RN core / módulo local | **[SPIKE]** (o `AppState` do RN é [DOC]-conhecido) |
| Distinguir bloqueio de tela | `ACTION_SCREEN_OFF` + `KeyguardManager` | `protectedDataWillBecomeUnavailable` — **onde disponível**; sem o sinal, o servidor não consegue atribuir a ausência ⇒ `UNVERIFIED` (D16, sem exigir passcode; o cliente não envia "causa") | módulo local | [SPIKE] |
| Detectar chamada | `AudioManager.getMode()` (`MODE_IN_CALL`/`MODE_RINGTONE`), sem permissão | `CXCallObserver` | módulo local | [SPIKE] |
| Boot detection | `Settings.Global.BOOT_COUNT` + `elapsedRealtime` | relógio contínuo (`mach_continuous_time`) | módulo local | [SPIKE] |
| Motivo de morte do processo | `ApplicationExitInfo` (API 30+) — **telemetria apenas** (relógio de parede; não credita) | inexistente | módulo local | [SPIKE] |
| Encerramento pelo usuário | `Service.onTaskRemoved` | `applicationWillTerminate` (só best-effort) | módulo local + plugin (manifest) | [SPIKE] |
| Execução em segundo plano com notificação persistente + *beacon* de continuidade (`HEARTBEAT` periódico e um final logo após `ends_at`) | Foreground Service (tipo declarado, Android 14+) hospedando a tarefa headless-JS/nativa que reporta ao servidor | não aplicável: o app suspende; o timer é por timestamp e a continuidade é provada quando o mesmo processo volta a reportar (≤ 7 dias) | config plugin (manifest/permissões) + módulo | [SPIKE] |
| Notificação local de fim | `expo-notifications` | `expo-notifications` | biblioteca Expo | [DOC] (biblioteca), comportamento em DND [SPIKE] |
| DND durante o Modo Foco | `NotificationManager.setInterruptionFilter` (exige concessão do usuário) | **sem API** para app de terceiros | módulo local | [SPIKE] |
| Turnstile | WebView | WebView | `react-native-webview` | [DOC] |
| Privacy manifest (iOS 17+, APIs de "system boot time") | — | declarar razão de uso | config do app (`ios.privacyManifests`) | [SPIKE] confirmar chave e código de razão |

**Veredito:** nada na lista exige sair do Expo; tudo é atendido por *dev client + módulo local em Kotlin/Swift + config plugin*. O risco não está no Expo, e sim nas próprias APIs do SO (seção 9). **Expo Go fica fora do fluxo de desenvolvimento.**

---

## 5. Visão geral

```text
┌──────────────────────── App (Expo dev client, RN + TS strict) ───────────────────────┐
│ UI (screens/components) ── hooks ── features/* ── domain/* (puro, testável)          │
│                                        │                                              │
│                          services/repositories ── supabase-js (anon key, JWT do user) │
│                                        │                                              │
│  pp-platform (módulo nativo Kotlin/Swift): sinais de lifecycle, tela, chamada, boot,  │
│  saída de processo, foreground service, DND → emite eventos tipados ao domínio        │
└───────────────────────────────────────────────┬──────────────────────────────────────┘
                                                │ HTTPS
┌───────────────────────────────────────────────▼──────────────────────────────────────┐
│ Supabase                                                                               │
│  Auth (senha, confirmação, captcha, rate limits nativos)                               │
│   └─ Custom Access Token Hook → device_sessions (sessão única, 30 d)                   │
│  PostgREST + RLS (somente SELECT do próprio dado)                                      │
│  RPCs SECURITY DEFINER: start_task · reconcile_task · sync_active_execution ·          │
│                          cancel_task · logout · get_home  (cliente envia SINAIS)        │
│  Job do servidor (pg_cron/cron externo): reconcile_due_executions (evidência + EXPIRED) │
│  Edge Functions (service role, só no servidor): auth-login · username-check ·          │
│     recovery-request · recovery-confirm · deletion-request · deletion-confirm ·        │
│     sweep (higiene)                                                                     │
│  Postgres: accounts · profiles · usernames · device_sessions · task_definitions ·      │
│     task_executions · execution_events · points_ledger · points_balance ·              │
│     recovery_requests · deletion_requests · audit_logs · rate_limit_counters           │
└───────────────────────────────────────────────────────────────────────────────────────┘
Netlify: página do widget Turnstile, páginas de confirmação de link (recovery/deletion), docs públicas.
```

---

## 6. Estrutura de diretórios (Expo, TypeScript strict)

```text
app.config.ts                 # plugins, permissões, privacyManifests, envs
modules/pp-platform/          # Expo module local (android/ kotlin, ios/ swift, src/ TS)
plugins/                      # config plugins locais (foreground service, permissões)
supabase/
  migrations/                 # DDL de database.md, uma migration por tema
  functions/                  # Edge Functions (Deno)
  tests/                      # pgTAP / testes SQL de RLS, ledger, execuções
src/
  app/                        # bootstrap, providers, injeção de dependências
  navigation/                 # stacks: Auth · Onboarding(Confirmação) · Main · Timer · Focus · Account
  screens/                    # somente composição de UI
  components/ · theme/        # design system (tokens, HUD, tipografia)
  domain/
    username/ password/       # validações puras (regex da spec)
    tasks/                    # definições espelhadas (somente exibição; autoridade = servidor)
    timers/
      shared/                 # relógio, offset servidor, tipos de sinal
      normal/                 # NormalTimerMachine (estados + transições)
      focus/                  # FocusTimerMachine (estados + transições)
    points/                   # formatação; sem cálculo autoritativo
  features/
    auth/ account/ points/ tasks/ timers/ focus/
  services/                   # api clients (RPC/Edge), notificações, telemetria
  repositories/               # acesso a dados + cache
  state/                      # Zustand: session · profile · points · timer · ui (stores separados)
  security/                   # secure store, install id, captcha bridge
  platform/                   # interfaces TS (PlatformSignals) + implementação via pp-platform
  hooks/ utils/ types/
docs/
```

Regras: `domain/` não importa React, Supabase nem módulos nativos. `features/*` orquestra. Constantes (regex, durações espelhadas, rótulos) vivem em um único módulo por domínio.

---

## 7. Estado, navegação e portões

- **Estado:** Zustand com stores separados (sessão, perfil, Points, timer, UI). O store de Points é **cache** do que o servidor devolveu; nunca é somado localmente.
- **Persistência local:** `expo-secure-store` para refresh token/install id; armazenamento simples só para preferências e para o *registro transitório* da execução ativa (que é dado de UX e de sinais, **não** autoridade).
- **Navegação:** grafos separados. O portão de acesso é **derivado do servidor**, não de flag local: após login o app chama `get_home`; a RPC falha (`session_not_authorized`/`account_not_active`) se a conta não está `ACTIVE` ou a sessão não é a vigente. Os guards visuais só refletem esse resultado. Mesmo que alguém force uma rota, **RLS e RPCs negam os dados** (spec 43).
- **Confirmação de e-mail obrigatória:** conta `PENDING_EMAIL` não tem sessão utilizável (o Auth não emite sessão sem confirmação e, adicionalmente, `require_session` exige `accounts.status = 'ACTIVE'`).

---

## 8. Fluxos principais (resumo; detalhes em security.md e timers.md)

**Cadastro:** app valida (UX) → Turnstile → `username-check` (UX) → `auth.signUp` com `data:{username, full_name}` → trigger `handle_new_user` valida de novo, cria `accounts(PENDING_EMAIL)`, reserva username por 24 h → e-mail de confirmação → usuário confirma → trigger `handle_email_confirmed` ativa a conta, torna o username `ACTIVE` e lança o crédito inicial (1.000) no ledger.

> **D19 (oficial):** o crédito inicial é lançado **na confirmação** e não no cadastro, de forma idempotente (chave `initial:<account_id>` + índice único parcial). Impede também farm de 1.000 Points por cadastros descartáveis.

**Login:** app → Turnstile → `auth-login` (rate limit por IP e por e-mail, auditoria de falha) → Auth (senha) → **Access Token Hook** decide/registra a sessão do dispositivo → app recebe JWT.

**Logout:** RPC `logout` (revoga `device_sessions`, interrompe execução ativa com motivo `LOGOUT`) → `auth.signOut()`. Se o app morrer entre os dois passos, o hook trata sessão do Auth inexistente como abandonada (database.md §4).

**Recuperar senha:** nativo do Auth (`resetPasswordForEmail`, com captcha), resposta neutra. A sessão temporária de recuperação **não** vira sessão de dispositivo (hook ignora métodos ≠ `password`).

**Recuperar conta / Excluir conta:** Edge Functions com token de uso único em tabela própria (hash do token), confirmação por *botão POST* (não por GET, para não ser consumido por scanners de e-mail — risco citado na doc do Supabase).

---

## 9. Riscos técnicos e spikes obrigatórios

| # | Risco | Impacto | Mitigação / spike |
|---|-------|---------|-------------------|
| R1 | iOS não distingue processo suspenso de encerrado sem cold start | Recompensa legítima negada em casos raros | D11/D16: regra por **instância de processo**; cold start após o fim vira estado `UNVERIFIED` (**sem Points**), não "prova de fraude". Ver timers.md §7–8 |
| R2 | Bloqueio de tela × Home no iOS | Modo Foco: perda de recompensa onde o iOS não fornece o sinal de bloqueio (ex.: aparelho sem passcode) | **Aceito por decisão (D16)**: sem exigir passcode; `UNKNOWN` → `UNVERIFIED`. **Spike em aparelho real** na Fase 7 para medir a cobertura do sinal |
| R3 | Foreground Service exige tipo declarado (Android 14+) e justificativa na Play Store | Rejeição/limitação | Spike de manifest; se não houver tipo adequado, usar `specialUse` com justificativa; o timer **não depende** do service para contar (timestamps) |
| R4 | Hook de token negando login pode "trancar" todos os usuários se houver bug | Indisponibilidade | Hook mínimo, testes de integração, *feature flag* em `app_config`, runbook de desativação |
| R5 | SMTP embutido inviável | Cadastro/recuperação quebram | Provedor SMTP próprio desde o dev (deployment.md) |
| R6 | Free pausa após 7 dias | Ambiente de prod indisponível | Produção em Pro (decisão de custo adiada) ou keep-alive; ver §3.2 |
| R7 | Dispositivo com root/jailbreak forja sinais | Recompensa indevida | Fora do alcance da V1; backlog: Play Integrity / App Attest (security.md §9) |
| R8 | Verificação de senha no fluxo Recuperar conta sem criar sessão | Complexidade | Spike na Fase 2: `crypt()` sobre `auth.users.encrypted_password` em função definer; fallback: pedir a senha de novo no passo final |

---

## 10. Mapeamento por fase

| Fase | Entrega | Depende de |
|------|---------|-----------|
| 1 | Projeto Expo/TS/lint/test/tema/envs + Supabase CLI + migrations 0001–0002 | este documento aprovado |
| 2 | Auth (signup, confirmação, login, logout, sessão única, reset) + hook + captcha | spikes R4, R5 |
| 3 | Conta (username, exclusão, recuperar conta) | spike R8 |
| 4 | Points (ledger, saldo, auditoria) | migrations 0004 |
| 5 | Tarefas | 0005 |
| 6 | Timer Normal + `pp-platform` (Android primeiro) | spikes R1, R3 |
| 7 | Modo Foco | spike R2 |
| 8–10 | Hardening, testes, builds e docs finais | — |


---

## 11. Provedores substituíveis (D25)

- **E-mail transacional (SMTP):** o Supabase Auth envia seus e-mails pelo SMTP configurado no painel/`config.toml` via variáveis de ambiente (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SENDER`). Para os e-mails **nossos** (recuperar conta, excluir conta) as Edge Functions usam a interface `Mailer` (`supabase/functions/_shared/mailer.ts`); o provedor é escolhido por `MAIL_PROVIDER` (`log` em dev; provedores reais entram como novos adaptadores sem tocar nas funções). Nenhum provedor, domínio ou segredo está no código.
- **Turnstile:** o app depende da interface `CaptchaProvider` (`src/services/captcha/`). A implementação por WebView carrega `TURNSTILE_PAGE_URL` (página hospedada no **domínio próprio**, definido depois) e recebe o token por `postMessage`; `TURNSTILE_SITE_KEY` também vem de configuração. O segredo do Turnstile vive só no painel do Auth e nos secrets das Edge Functions.
