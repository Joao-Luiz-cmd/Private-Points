# MANIFEST — private-points (empacotamento Fase 1)

Gerado em 2026-10-07. Conteúdo do ZIP: a pasta `private-points/` (código, `supabase/`, `scripts/`, `docs/`, `tools/`, configurações) **mais o histórico Git (`.git/`)**.

**Nada neste ZIP deve ser lido como 'testado' por estar presente.** A coluna *Estado* abaixo vem do `docs/phase1-gate.md`.

**Exclusões deliberadas:** `.env` e `.env.*` (exceto `.env.example`, só com nomes), `node_modules/`, `.expo/`, `android/`, `ios/`, `coverage/`, chaves/certificados/keystores, tokens. **Não existe `package-lock.json`** (nunca foi gerado: sem rede no ambiente de origem). **Não existe `eas.json`.**

Literais que parecem segredos mas são **fixtures de teste**: JWT de exemplo em `src/utils/__tests__/redact.test.ts`; senha de exemplo da especificação (`Private@123`) em `src/domain/password/__tests__/password.test.ts`.

## Estado por grupo

| Grupo | Tipo | Estado |
|---|---|---|
| src/domain/, src/utils/, src/security/, src/config/parseConfig.ts, src/services/captcha/ | Lógica pura | `tsc --strict` OK e 101 testes OK **sob um shim (não Jest)** no ambiente de origem (Linux, Node 22.22.2, TS 6.0.3). **Jest real: NÃO VERIFICADO.** |
| src/app/, src/navigation/, src/screens/, src/components/, src/state/, src/supabase/, src/theme/, src/config/env.ts, index.ts | UI/Expo/Supabase client | **NÃO VERIFICADO** — nunca compilados com as dependências React Native/Expo, nunca executados, nenhuma tela renderizada. |
| app.config.ts, babel.config.js, metro.config.js, jest.config.js, eslint.config.mjs, .prettierrc, tsconfig.json, package.json | Configuração | **NÃO VERIFICADO** em execução (só sintaxe de `.js`/`.json` checada). Versões pinadas em `package.json` **não** confirmadas por `npm install`; **não há `package-lock.json`**. |
| supabase/migrations/ | Migrations (0001–0002) | **NÃO VERIFICADO — nunca executadas em PostgreSQL.** |
| supabase/spike/, scripts/spike_auth_hook.sh | Spike do Auth Hook | **NÃO EXECUTADO** (só `bash -n` do script). Resultados do spike: nenhum. |
| supabase/config.toml, supabase/functions/_shared/mailer.ts | Config local e e-mail | **NÃO VERIFICADO** (sem Supabase CLI/Deno). |
| scripts/install-deps.sh | Instalação | **NÃO VERIFICADO** (nunca rodou; `expo install --dev` inclusive). |
| .github/workflows/ci.yml | CI | **NÃO VERIFICADO**; `npm ci` exige `package-lock.json`, que não existe. |
| docs/ | Documentação | Documentos de projeto. O SQL em `docs/database.md` é **referência nunca executada**. `docs/phase1-gate.md` é o registro oficial de VERIFICADO / NÃO VERIFICADO. |
| docs/spikes/attestation-spike.md | Spike de atestação | **25 experimentos NÃO EXECUTADOS** (0 PASS / 0 FAIL). |
| tools/logic-check/ | Verificação de lógica sem Jest | Adicionado no empacotamento; verificado **só** no ambiente de origem (TS 6.0.3). **Não é Jest.** |
| assets/ | Ícones | Placeholders gerados por script; substituir pela arte final. |
| README-SETUP-WINDOWS.md, MANIFEST.md, .gitattributes, .prettierignore | Empacotamento | Adicionados nesta etapa; não alteram arquitetura. |

## Histórico Git incluído (`.git/`)

O commit que adiciona este `MANIFEST.md` **não** está listado abaixo (ele é criado depois da geração).

```text
e2cb52b chore: Windows setup guide, logic-check tooling (not Jest), LF attributes, remove hardcoded spike password
66d1695 chore: remove stale compiled .js files accidentally committed under src/ (Metro could resolve them before .ts); ignore them
7d7ceb1 docs: gate - attestation spike not executed (0 PASS / 0 FAIL / 25 NOT EXECUTED), phase 1 remains open
4e59280 docs(spike): record attestation spike execution status - all 25 experiments NOT EXECUTED (no real environment); no results invented
1227b95 docs: gate revision 4 and consistency review 6 (attestation spike pending, phase 1 still open)
d37719c docs: record preliminary architectural decision C (attestation) as D28; A not acceptable as final, B not a security mechanism
8dafc40 docs(spike): attestation spike specification (Play Integrity / App Attest) - documented facts, capability matrix, experiments; nothing implemented
bd2817a docs: gate revision 3 and consistency review 5
e3a3e24 docs: beacon analysis (8 properties, worst-case fraud, options A/B/C) - no decision taken
abbf6c1 docs: field authority in three categories, COMPLETED definition (D27), server-side absence classification (D26)
395b654 docs(db): absence_verdict (server classifies raw signals), drop cause column, CHANNEL_* events, R1/R3 rewrite
2ec4446 feat(timers): executable reference model of server-side absence classification with tests
21567b4 refactor(focus)!: remove client-side 'cause'; client reports raw observations only, every absence goes to PENDING_VERDICT
362af14 docs: final phase 1 gate table (phase remains open), consistency review 4 and README honesty on reproducibility
10d8019 feat(spike): hook probe with S1 single-session, S2 30-day expiry and S3 recovery scenarios with PASS/FAIL assertions (unexecuted)
039037e docs: beacon server-side properties, identifiers as signals, client contract audit and UNVERIFIED path audit
ba7609e docs(db): harden credit_execution (lock+RUNNING), ledger constraint trigger, event validations, device-session binding
0b763c1 test(timers): exhaustive UNVERIFIED immutability across both machines
c7add8b feat(timers): strict allowlist + authority tripwire for client payloads; rename process_exit.reason to kind
4978c32 refactor(timers): rename completion margin to signalSendMargin; document calibration is not proof of honesty
4a76ec2 feat(spike): auth hook probe, spike script, local config and mailer interface (unverified)
430adaa chore: pinned expo sdk 57 core deps, install script, assets and CI note
3de28bc feat(timers): explicit clock calibration, client signal contract, drop CLOCK_INCOHERENT; add captcha abstraction
ca92482 docs: revision 3 (clock model, immutable UNVERIFIED, client contract) and phase 1 gate report
d61b0f7 chore: add placeholder directories
266fd9c feat(db): add schemas/privileges and accounts/usernames migrations (unverified)
9785dfe feat(app): add theme, guarded navigation graphs and Supabase client wiring
bdf2d12 feat(domain): add username, password, timer state machines and pure utilities with tests
69462d3 chore: add tooling config, CI and README
dc98252 docs: add V1 architecture, database, security, timers and consistency review
```

## Arquivos (94 fora de `.git/`, sem contar este `MANIFEST.md`)

| Arquivo | Bytes | SHA-256 |
|---|---:|---|
| `.editorconfig` | 146 | `1b88c898757f0c87…` |
| `.env.example` | 307 | `6ea04c41a92ad21e…` |
| `.gitattributes` | 168 | `be2acc9796594820…` |
| `.github/workflows/ci.yml` | 453 | `b2e1a2b579017849…` |
| `.gitignore` | 339 | `6e6ebf0f6be4f262…` |
| `.prettierignore` | 7 | `b2d4393121a103eb…` |
| `.prettierrc` | 81 | `c258a957722f1a07…` |
| `README-SETUP-WINDOWS.md` | 10081 | `b60acf951d5cbbb5…` |
| `README.md` | 2668 | `f79463f3f19fe8cb…` |
| `app.config.ts` | 1526 | `57703377cee20800…` |
| `assets/adaptive-icon.png` | 18547 | `5d1a1e17e1ccc63d…` |
| `assets/icon.png` | 20117 | `c9c19029f52e947d…` |
| `babel.config.js` | 101 | `4b96981e76f4da97…` |
| `docs/architecture.md` | 25923 | `bfb885fc7f7a1f18…` |
| `docs/authentication.md` | 386 | `858971eba076f82b…` |
| `docs/beacon-analysis.md` | 12392 | `1461efa56c261d63…` |
| `docs/consistency-review.md` | 3895 | `0358d9f7a34c6807…` |
| `docs/database.md` | 62540 | `2cd8793e447c66dd…` |
| `docs/deployment.md` | 510 | `725dcaf26a4be38e…` |
| `docs/phase1-gate.md` | 12025 | `9939ce1bbc3d32c5…` |
| `docs/security.md` | 19808 | `610fba7c409a1f13…` |
| `docs/spikes/attestation-spike.md` | 34176 | `f83a190b9dd548c0…` |
| `docs/spikes/auth-hook-spike.md` | 2011 | `6a897b93d5406a40…` |
| `docs/testing.md` | 457 | `d152094ff13db3c5…` |
| `docs/timers.md` | 34496 | `5632e53ce84e2f1e…` |
| `eslint.config.mjs` | 935 | `5c5856c3abe6a739…` |
| `index.ts` | 112 | `9d84321d9b44befd…` |
| `jest.config.js` | 366 | `3e92bb8f52694244…` |
| `metro.config.js` | 106 | `0d2906cd24cc5126…` |
| `modules/.gitkeep` | 0 | `e3b0c44298fc1c14…` |
| `package.json` | 842 | `994d375442bf452c…` |
| `plugins/.gitkeep` | 0 | `e3b0c44298fc1c14…` |
| `scripts/install-deps.sh` | 1005 | `3857b0ca98952102…` |
| `scripts/spike_auth_hook.sh` | 8080 | `34cad0b48b320dc0…` |
| `src/app/App.tsx` | 1017 | `8fff67994a7af509…` |
| `src/components/HudText.tsx` | 703 | `f68e982cf1eba1cb…` |
| `src/components/Screen.tsx` | 614 | `29df2901872ef34b…` |
| `src/config/__tests__/parseConfig.test.ts` | 1829 | `20cab0af55d81181…` |
| `src/config/env.ts` | 285 | `6e99f7260dbb9136…` |
| `src/config/parseConfig.ts` | 2453 | `a2d9865a61a444c5…` |
| `src/domain/access/__tests__/route.test.ts` | 838 | `23b92d152d418684…` |
| `src/domain/access/route.ts` | 683 | `205bfdf3715cdd2e…` |
| `src/domain/password/__tests__/password.test.ts` | 1114 | `9c33c172119452bd…` |
| `src/domain/password/password.ts` | 838 | `8640ad8654ab412a…` |
| `src/domain/points/__tests__/format.test.ts` | 484 | `84a70d38ee0b8659…` |
| `src/domain/points/format.ts` | 435 | `b69b3ff3ffd32af1…` |
| `src/domain/tasks/catalog.ts` | 484 | `b8d8441570ed0a6e…` |
| `src/domain/timers/__tests__/clock.test.ts` | 4121 | `76ebda7601636d15…` |
| `src/domain/timers/__tests__/focus.test.ts` | 3223 | `a61b7c42178b5f12…` |
| `src/domain/timers/__tests__/immutability.test.ts` | 3558 | `da1ab97db12e41d5…` |
| `src/domain/timers/__tests__/normal.test.ts` | 3334 | `4f1643712f8b0ad8…` |
| `src/domain/timers/__tests__/separation.test.ts` | 1080 | `7d8d5a25f9f60ccd…` |
| `src/domain/timers/__tests__/signals.test.ts` | 6225 | `3f5edfd862d1a505…` |
| `src/domain/timers/__tests__/types.test.ts` | 1746 | `a0e2e79d1db07c2d…` |
| `src/domain/timers/focus/machine.ts` | 3228 | `1ca3328de061adf4…` |
| `src/domain/timers/index.ts` | 165 | `b8d8f26976f472c8…` |
| `src/domain/timers/normal/machine.ts` | 2464 | `de870a5b781d6cf0…` |
| `src/domain/timers/reference/__tests__/absence.test.ts` | 3560 | `90c8f819658a1e8c…` |
| `src/domain/timers/reference/absence.ts` | 2273 | `403ed7e28e39205f…` |
| `src/domain/timers/shared/clock.ts` | 5460 | `17c9d7e360bf4baa…` |
| `src/domain/timers/shared/signals.ts` | 6155 | `28b49cc154f6a84f…` |
| `src/domain/timers/shared/types.ts` | 1964 | `a37e71151cc30c2f…` |
| `src/domain/username/__tests__/username.test.ts` | 1635 | `aecbfc8c62b2161b…` |
| `src/domain/username/username.ts` | 1222 | `70bbe849f4336433…` |
| `src/navigation/AuthStack.tsx` | 841 | `73676a25fef07924…` |
| `src/navigation/MainStack.tsx` | 964 | `f268cd7a25eb2d6f…` |
| `src/navigation/OnboardingStack.tsx` | 522 | `53f42b3cde6728e4…` |
| `src/navigation/RootNavigator.tsx` | 1519 | `73d4805fd503f23b…` |
| `src/navigation/types.ts` | 497 | `a999e0111332f12d…` |
| `src/screens/PlaceholderScreen.tsx` | 619 | `5078355be92f89cd…` |
| `src/security/__tests__/chunkedStorage.test.ts` | 2652 | `f75a54606015185f…` |
| `src/security/chunkedStorage.ts` | 2463 | `b56d2c2d6f44a149…` |
| `src/services/captcha/__tests__/captcha.test.ts` | 1965 | `886e51479175686c…` |
| `src/services/captcha/captcha.ts` | 2827 | `0c5c8ff7c3de7a06…` |
| `src/state/sessionStore.ts` | 487 | `92cfd5f6ce18249c…` |
| `src/supabase/client.ts` | 918 | `d89b949ad22c03e2…` |
| `src/supabase/lifecycle.ts` | 504 | `7f26b082f49dcce2…` |
| `src/theme/index.ts` | 26 | `552563951b698ac6…` |
| `src/theme/tokens.ts` | 887 | `d2370a7960fff77f…` |
| `src/utils/__tests__/redact.test.ts` | 1219 | `e3a604f4dfcc33a8…` |
| `src/utils/redact.ts` | 1015 | `1d6cc3bdd0ae1b95…` |
| `supabase/config.toml` | 1200 | `14700ea890b6df5b…` |
| `supabase/functions/.gitkeep` | 0 | `e3b0c44298fc1c14…` |
| `supabase/functions/_shared/mailer.ts` | 1198 | `6f33c0fd378b000b…` |
| `supabase/migrations/20260930000001_schemas_privileges.sql` | 962 | `2bb5cc9f8fd1fff5…` |
| `supabase/migrations/20260930000002_accounts_profiles_usernames.sql` | 3238 | `4798e0fa33d44d1c…` |
| `supabase/spike/001_hook_probe.sql` | 5353 | `dd9408db88e7c670…` |
| `supabase/tests/.gitkeep` | 0 | `e3b0c44298fc1c14…` |
| `tools/logic-check/README.md` | 1157 | `1bea05138df12460…` |
| `tools/logic-check/jest-globals.d.ts` | 600 | `8b79513be2333dbc…` |
| `tools/logic-check/jestshim.cjs` | 1495 | `88a485b752dbad52…` |
| `tools/logic-check/run.cjs` | 714 | `137cb5bf62469702…` |
| `tools/logic-check/tsconfig.json` | 622 | `64adab2d1ab90a7f…` |
| `tsconfig.json` | 431 | `0eac08834e522c06…` |

> SHA-256 truncado em 16 caracteres para leitura; o hash completo pode ser recalculado com `Get-FileHash <arquivo> -Algorithm SHA256` (PowerShell).
