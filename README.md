# Private Points — V1

App mobile (Expo + React Native + TypeScript) com backend Supabase. Especificação e decisões oficiais: [docs/](docs/).
**Estado:** Fase 1 **não encerrada** — veja [docs/phase1-gate.md](docs/phase1-gate.md) (o que está VERIFICADO e o que NÃO está).

## Preparar o ambiente (ainda NÃO reproduzido)

Estado honesto: **configuração de reprodutibilidade preparada; instalação real não executada; lockfile não validado; build não executado.** O repositório foi escrito num ambiente sem rede e **nunca foi instalado nem compilado**.

```bash
./scripts/install-deps.sh      # instala o pinado em package.json + o restante via `expo install`/npm
npm run verify                 # typecheck + eslint + prettier --check + jest  (NUNCA rodou)
git add package-lock.json      # o lockfile ainda não existe/validado; só então o CI pode usar `npm ci`
npx expo run:android           # dev build (Expo Go NÃO é suportado)
```

`package.json` pina `expo`, `react`, `react-native`, `expo-constants`, `expo-dev-client` e `expo-secure-store` (SDK 57) com base em fontes públicas consultadas por busca — **não confirmadas por `npm install`**; se alguma versão não existir, o install falhará e isso deve ser reportado. As demais dependências **não estão pinadas** (versão não confirmada). O CI (`npm ci`) **não funcionará até o lockfile ser gerado e commitado**.

## Backend local e spike do Auth Hook

```bash
npx supabase start && npx supabase db reset          # aplica supabase/migrations/* (NUNCA executadas até agora)
./scripts/spike_auth_hook.sh                          # Fase 2, passo 1 (usa supabase/spike/001_hook_probe.sql)
```

Resultado do spike: [docs/spikes/auth-hook-spike.md](docs/spikes/auth-hook-spike.md).

## Configuração (sem segredos no repositório)

`APP_ENV`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `TURNSTILE_SITE_KEY`, `TURNSTILE_PAGE_URL` (página do widget no domínio próprio, definido depois) via `.env.<ambiente>`; e-mail por `MAIL_PROVIDER`/SMTP_* (Edge Functions/Auth). Ver `.env.example`.

## Estrutura

`src/domain` (puro) · `src/features` · `src/navigation` · `src/state` · `src/supabase` · `src/security` · `src/services` · `src/theme` · `modules/` (módulo nativo `pp-platform`, Fase 6) · `supabase/` (migrations, spike, functions, tests) · `scripts/`.

## Disciplina de "pronto"

Resumo de verificação: veja [docs/phase1-gate.md](docs/phase1-gate.md) (tabela VERIFICADO/NÃO VERIFICADO). Uma funcionalidade só é "pronta" com: código + teste + integração validada (quando aplicável) + documentação + comportamento conhecido em Android/iOS (quando aplicável).
