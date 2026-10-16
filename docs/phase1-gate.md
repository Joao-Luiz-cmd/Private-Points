# Fase 1 — Gate técnico (revisão 4, 03/10/2026)

**Estado da Fase 1: ABERTA.** A Fase 2 **não** foi iniciada.
Legenda: **VERIFICADO** = executado/observado neste ambiente. **NÃO VERIFICADO — motivo** = não executado; nada foi marcado como verificado por inferência do código.

**Ambiente:** sem rede (`npm view` → 403), sem Docker, sem PostgreSQL, sem Supabase CLI, sem ESLint/Prettier/Jest. Disponíveis: Node 22, TypeScript 6.0, Python, Bash.

## 1. Tabela final

| Área | Estado | Observação |
|---|---|---|
| Implementação estática | **VERIFICADO** (leitura + busca textual) | 90+ arquivos revisados; 83 imports locais resolvem. Não implica que o app roda |
| Testes de domínio | **VERIFICADO — como teste de LÓGICA** | 101 testes passam sob um **shim** sobre `node:test` escrito por mim (matchers reimplementados). **Não substitui o Jest real** |
| Classificação de ausências no servidor (`absence_verdict`, SQL) | **NÃO VERIFICADO — ambiente sem PostgreSQL** | O SQL nunca executou. O **modelo de referência em TypeScript** (`domain/timers/reference/absence.ts`) passou nos testes de lógica; paridade SQL×TS é teste pendente |
| Jest real | **NÃO VERIFICADO — Jest/jest-expo não instalados, sem rede** | `jest.config.js` nunca executado |
| TypeScript completo | **NÃO VERIFICADO — depende de pacotes ausentes** | `tsc --strict` passa só nos módulos puros (`domain`, `utils`, `security`, `config/parseConfig`, `services/captcha`). `app/`, `navigation/`, `screens/`, `components/`, `supabase/`, `app.config.ts` não foram checados |
| ESLint | **NÃO VERIFICADO — não instalado** | Inclui a regra "domínio não importa React/Supabase" |
| Prettier | **NÃO VERIFICADO — não instalado** | Os arquivos podem precisar de `prettier --write` |
| Expo/Metro | **NÃO VERIFICADO — sem pacotes** | `node --check` só valida a sintaxe dos `.js` |
| App executando | **NÃO VERIFICADO** | Nenhuma tela foi renderizada |
| PostgreSQL/migrations | **NÃO VERIFICADO — ambiente sem PostgreSQL** | Nenhuma migration (nem o SQL de referência) jamais executou |
| RLS | **NÃO VERIFICADO — ambiente sem PostgreSQL** | |
| SECURITY DEFINER | **NÃO VERIFICADO — ambiente sem PostgreSQL** | |
| Constraints/índices (inclui únicos parciais e constraint trigger do ledger) | **NÃO VERIFICADO — ambiente sem PostgreSQL** | |
| Auth Hook | **NÃO VERIFICADO — sem projeto/instância Supabase** | Doc consultada; comportamento real não observado |
| Sessão única real (`device_sessions`) | **NÃO VERIFICADO — idem** | S1–S3 do spike preparados, não executados |
| Android real | **NÃO VERIFICADO** | Nenhuma API de SO exercitada |
| iOS real | **NÃO VERIFICADO** | idem |
| Atestação (Play Integrity / App Attest) | **NÃO VERIFICADO — spike NÃO EXECUTADO** | 25 experimentos: **0 PASS, 0 FAIL, 25 NÃO EXECUTADO** (sem rede, sem aparelhos Android/iOS, sem conta Apple Developer, sem Play Console/Google Cloud, sem Supabase). Decisão C segue **preliminar e não validada**. Registro em [spikes/attestation-spike.md §13](spikes/attestation-spike.md) |
| Reprodutibilidade | **configuração PREPARADA; instalação real NÃO executada; lockfile NÃO validado; build NÃO executado** | O repositório **não foi reproduzido**. Ver §4 |

## 2. Revisões desta rodada (resultado)

### 2.000 Rodada mais recente — tentativa de executar o spike de atestação (04/10/2026)

- **Nenhum experimento pôde ser executado** neste ambiente (motivos M1–M8 em [spikes/attestation-spike.md §13.1](spikes/attestation-spike.md)). Registrado como **NÃO EXECUTADO — motivo**, que é resultado válido porém **não é evidência positiva**.
- Das 10 perguntas prioritárias, **0 respondidas**; conjunto mínimo para as perguntas 1–5 e pré-requisitos faltantes em §13.4–§13.5 do spike.
- Riscos listados no §13.6 do spike vêm **de leitura da documentação**, não de experimento.
- Nenhuma alteração de arquitetura, regra de produto ou código. **Fase 1 aberta. Fase 2 não iniciada.**

### 2.00 Decisão preliminar C (atestação)

- Registrado: **C — atestação** é a decisão arquitetural **preliminar**; **A não é aceitável como solução final** e **B não é mecanismo de segurança da economia** (D28).
- **Spike especificado, não executado:** [spikes/attestation-spike.md](spikes/attestation-spike.md) — fatos documentados (Android/iOS) com fonte, matriz de capacidades (só o documentado; o resto `?`), modelo de vínculo a testar (conta/sessão/execução, desafio, replay, expiração, rotação), 25 experimentos, tabela de ataques e critérios de saída.
- **Não decidido:** `sem atestação ⇒ UNVERIFIED`; política para quem não consegue atestar; se o app funciona sem atestação; se só a recompensa é restringida. Dependem do spike.
- Economia, duração e regras dos timers: **inalteradas**.
- Atestação é **camada adicional**; todas as regras de autoridade, `UNVERIFIED`, idempotência, sessão única e classificação server-side permanecem.

### 2.0 Rodada anterior — `cause` deixou de ser autoridade do cliente

- **Correção aplicada:** o campo `cause` (classificação feita pelo cliente) **foi removido** do contrato, do SQL, do TypeScript e dos testes. O cliente reporta **observações brutas** (`BACKGROUND`, `SCREEN_LOCKED`, `CALL_STARTED`, `CHANNEL_*_OBSERVABLE`); o **servidor** classifica (`private.absence_verdict`) e aplica a regra: ausência corroborada por bloqueio de tela/ligação ⇒ compatível; sem corroboração com os dois canais ⇒ `INTERRUPTED`; com canal ausente ⇒ `UNVERIFIED`. Comportamento de produto **idêntico** ao aprovado (D01/D16); mudou **quem decide**.
- **Máquina do Modo Foco:** removidos os estados locais "tela bloqueada" e "ligação tolerada"; toda ausência vai a `PENDING_VERDICT` e só o servidor retoma (`RUNNING`) ou encerra.
- **Busca por campos semelhantes** (`cause`, `reason`, `type`, `source`, `kind`, `event_kind`, `status`…): classificados em **informativos / evidências / decisões do servidor** (security §12.1). Nenhum outro campo do cliente altera diretamente a decisão.
- **`COMPLETED`** definido como *evidência aceita como suficiente segundo as regras da V1*, não prova criptográfica (timers §2.2, security §12.3); identificadores, monotônico e beacon são **sinais de continuidade e consistência**.
- **Beacon:** tabela das 8 propriedades, pior caso de fraude e análise A/B/C em [beacon-analysis.md](beacon-analysis.md). **Decisão do beacon não tomada.**
- Nenhuma outra regra (recompensa, duração, estados, `UNVERIFIED`, ligação, background, reboot, encerramento, sessão única) foi alterada.

### 2.1 Rodadas anteriores

1. **Relógio.** `server_now` é a autoridade; parede não participa; monotônico mede tempo local; correlação só por calibração documentada. Escrito em timers §1.1 e no cabeçalho de `clock.ts`: *calibração é estimativa operacional de correlação temporal, não prova de honestidade do cliente; a segurança da recompensa não depende da fórmula*. **Margem de 2 s:** renomeada para `signalSendMarginMs` / `signalSendDelayMs`; é margem técnica de **envio**, **não** tolerância de conclusão; no SQL a comparação é **estrita** (`received_at >= ends_at`, sem `+ margem`).
2. **`UNVERIFIED` — busca final por caminhos de promoção.** Resultado: **nenhum caminho encontrado** para `UNVERIFIED → COMPLETED`, `UNVERIFIED → RUNNING` ou crédito ligado a execução `UNVERIFIED` (lista completa dos `UPDATE`/`INSERT` em security §12.2). Durante a busca encontrei e **corrigi** um defeito: `credit_execution` lançava o ledger **antes** de confirmar que a linha ainda estava `RUNNING`; agora relê sob lock, exige `RUNNING` e usa os valores da linha travada. Acrescentei um **constraint trigger diferido** no ledger (`TASK_REWARD` só existe se a execução referenciada estiver `COMPLETED`). Tudo isso por **leitura e teste de lógica**; **nenhuma parte executou em PostgreSQL**.
3. **Contrato de autoridade.** Revisão textual de SQL e TypeScript por campos indiretos (`should_credit`, `success`, `completion_status`, `verdict`, `eligible`…): nenhum campo do cliente com esses nomes. Troquei a lista negra por **allowlist estrita** (cliente e `ingest_events`) + tripwire por radicais com testes. Achado honesto: **`cause` é uma atribuição do cliente que pode tornar uma saída "tolerada"**; documentado como risco residual (security §9.8, §12.1). Também vinculei a execução à **sessão de dispositivo** que a iniciou (`device_session_id`).
4. **Beacon do Android.** Documentadas as 8 propriedades que o servidor realmente verifica e **o que ele NÃO consegue provar** (timers §7.7). **Conclusão que vai para sua revisão:** sem atestação, `COMPLETED` na V1 = *sinais consistentes + tempo do servidor + ausência de contradição*, **não** *prova de permanência*. Opções A/B/C listadas, **nenhuma implementada**.
5. **`process_instance_id` / `boot_id`.** Documentados como **sinais de continuidade, não mecanismos de segurança**; um cliente hostil os falsifica.
6. **Limitações × regras de produto.** Nenhuma regra de produto foi alterada. Consequências de limitações de plataforma permanecem listadas (iOS suspenso, sinal de bloqueio no iOS, evidência do cliente no Foco, beacon) para a sua decisão.

## 3. Bloqueadores restantes

| # | Bloqueador | Por quê |
|---|---|---|
| B1 | **PostgreSQL real** | Nada de SQL foi executado (migrations, RLS, constraints, índices parciais, definer, constraint trigger) |
| B2 | **Spike do Auth Hook** | Valores de `authentication_method`; `auth.sessions` existe no momento do hook?; negação do login e sessões órfãs; **provar S1, S2, S3** |
| B3 | **Instalação real e lockfile** | `npm install`, `package-lock.json`, `npm run verify` |
| B4 | ~~Decisão A/B/C~~ **Decidido (preliminar): C.** Implementação **pendente do spike** | Ver B6 |
| B6 | **Spike de atestação** ([spikes/attestation-spike.md](spikes/attestation-spike.md)) — **NÃO EXECUTADO** (falta ambiente real: §13.5) | A **arquitetura definitiva de recompensa** só é aprovada após a revisão do resultado. **Nenhum resultado existe ainda** |
| B5 | Spikes Android/iOS | Fases 6–7; não bloqueiam a Fase 2 |

## 4. Comandos a executar (ambiente com rede + Docker/PostgreSQL)

```bash
# 1) Instalação e verificação do app
./scripts/install-deps.sh && npm run verify 2>&1 | tee verify.log
git add package-lock.json   # só depois de verify passar

# 2) PostgreSQL real: migrations
npx supabase start
npx supabase db reset 2>&1 | tee db-reset.log

# 3) Spike do hook (habilite [auth.hook.custom_access_token] em supabase/config.toml antes)
npx supabase stop && npx supabase start
./scripts/spike_auth_hook.sh 2>&1 | tee spike.log
```

## 5. O que preciso que você me devolva

1. `verify.log` (typecheck, eslint, prettier, jest) — **ou** a lista de erros.
2. `package-lock.json` (ou `npm ls --depth=0`) e as **versões efetivamente instaladas**; sinalize se alguma versão pinada no `package.json` não existir.
3. `db-reset.log` — saída completa, **inclusive erros** (cada erro de SQL é informação).
4. `spike.log` completo (linhas `PASS`/`FAIL` de S1–S3 e as observações **Q1/Q2/Q3**), mais `psql "$DB_URL" -c "select * from spike.hook_events order by id"`.
5. Versão do Supabase CLI (`npx supabase --version`) e o plano/projeto onde o hook foi habilitado.
6. ~~Decisão A/B/C~~ — registrada: **C preliminar**. Para o **spike de atestação**, providencie os pré-requisitos do §10 de [spikes/attestation-spike.md](spikes/attestation-spike.md) (conta Apple Developer e iPhone real; Play Console, projeto Google Cloud e aparelhos Android) e devolva os resultados dos experimentos A-/I-/X-.

Critério para encerrar a Fase 1: 1–3 limpos, `FALHAS: 0` no spike do Auth Hook, B4 registrada (feito: C preliminar) **e a revisão do resultado do spike de atestação (B6)**. **Não conto nada como pronto antes disso.**
