# Private Points — Configuração no Windows 11

> **Objetivo deste guia:** reproduzir no seu computador o **estado atual** do projeto, sem mudar a arquitetura.
> **Estado real:** o código foi escrito num ambiente **sem rede, sem aparelhos e sem PostgreSQL**. **Nada** do que depende de dependências instaladas, de Expo, de PostgreSQL, de Supabase ou de aparelho foi executado. Estar no código **não** significa estar testado. A Fase 1 continua **aberta** (ver `docs/phase1-gate.md`).
>
> Onde este guia usa conhecimento geral de React Native/Windows (e não algo verificado por mim neste projeto), está marcado **[NÃO VERIFICADO]**.

---

## 1. Pré-requisitos

| Item | Versão / observação |
|---|---|
| Windows | 11 |
| **Node.js** | **22.x**. `package.json` declara `engines.node >= 22.13.0` (escolha minha, **[NÃO VERIFICADO]** contra o requisito do Expo SDK 57). Os testes de lógica rodaram em **Node 22.22.2** (Linux) |
| npm | o que acompanha o Node 22 |
| Git for Windows | inclui o **Git Bash** (necessário para os scripts `.sh`) |
| Android Studio | para o Android SDK (Platform + **Platform-Tools/adb**) e o JDK embutido. Versão de JDK exigida pelo RN 0.86 / SDK 57: **[NÃO VERIFICADO]** |
| Driver USB do fabricante do celular | se o `adb devices` não listar o aparelho |
| Docker Desktop | **só** para o Supabase local (§8); não é necessário para o app nem para os testes de lógica |
| `psql`, `jq`, `curl` | **só** para `scripts/spike_auth_hook.sh` (§8) |

**iOS não é possível no Windows** (exige macOS ou build na nuvem, que depende de conta Apple Developer e de `eas.json`, **que não existe neste repositório**).

Recomendações gerais para React Native no Windows **[NÃO VERIFICADO]**: extraia o projeto num caminho **curto** (ex.: `C:\dev\private-points`, não em OneDrive/Desktop) e habilite caminhos longos (`git config --system core.longpaths true` em PowerShell administrador, e a opção *LongPathsEnabled* do Windows).

## 2. Extrair e conferir o repositório

```powershell
New-Item -ItemType Directory C:\dev -Force | Out-Null
Expand-Archive -Path .\private-points-fase1.zip -DestinationPath C:\dev
cd C:\dev\private-points
git status            # esperado: "nothing to commit, working tree clean"
git log --oneline     # o histórico de commits veio no ZIP (.git incluído)
```

`.gitattributes` força final de linha **LF** para `*.sh`, `*.sql` e `*.toml` (CRLF quebra scripts no Git Bash). Se, mesmo assim, um `.sh` falhar com `\r: command not found`, rode `git add --renormalize .` e extraia de novo.

## 3. Verificação rápida de lógica (sem Expo, só Node + TypeScript)

Não depende das bibliotecas do app. **Não é Jest.**

```powershell
npx --yes -p typescript tsc -p tools/logic-check/tsconfig.json
node tools/logic-check/run.cjs
```

- Registro da última execução (Linux, Node 22.22.2, TypeScript 6.0.3): **101 testes, 101 passaram**, com `tsc --strict` sem erros nos módulos puros.
- Na sua máquina, `npx` baixará a **versão mais recente** do TypeScript, que pode ser diferente: **[NÃO VERIFICADO]**. Registre o resultado, inclusive se falhar.
- O que isso **não** prova: Jest real, ESLint, Prettier, Metro, o app rodando, PostgreSQL, Auth, Android/iOS.

## 4. Instalar dependências do app

O repositório **não tem `package-lock.json`**. `package.json` pina só: `expo ~57.0.22`, `react 19.2.3`, `react-native 0.86.3`, `expo-constants ~57.0.18`, `expo-dev-client ~57.0.19`, `expo-secure-store ~57.0.3` — versões coletadas de fontes públicas **sem confirmar por `npm install`**. As demais bibliotecas **não estão pinadas** (não pude confirmar versões). Equivalente PowerShell de `scripts/install-deps.sh`:

```powershell
cd C:\dev\private-points

npm install                                   # (1) se falhar por versão inexistente, ENVIE O ERRO completo

npx expo install react-native-safe-area-context react-native-screens react-native-webview
npm install @react-navigation/native @react-navigation/native-stack zustand @supabase/supabase-js react-native-url-polyfill

npx expo install --dev jest-expo              # (2) ver nota abaixo
npm install --save-dev jest @types/jest typescript @types/react typescript-eslint eslint eslint-plugin-react-hooks prettier

npx expo install --check                      # confirma/ajusta ao SDK
```

(2) `--dev` com `expo install` é parte do script **não verificado**. Se for rejeitado, use `npm install --save-dev jest-expo` e depois `npx expo install --check`.

Se tudo passar, o `package-lock.json` gerado deve ser **commitado** (`git add package-lock.json`): só então o CI (`npm ci`) pode funcionar.

## 5. Scripts disponíveis (`package.json`)

| Script | O que roda | Estado |
|---|---|---|
| `npm start` | `expo start --dev-client` | NÃO VERIFICADO |
| `npm run android` | `expo run:android` (build nativo local) | NÃO VERIFICADO |
| `npm run ios` | `expo run:ios` | **não funciona no Windows** |
| `npm run typecheck` | `tsc --noEmit` (projeto inteiro) | NÃO VERIFICADO (só módulos puros foram checados) |
| `npm run lint` | `eslint .` | NÃO VERIFICADO |
| `npm run format` / `format:check` | Prettier | NÃO VERIFICADO (os arquivos podem precisar de `npm run format`) |
| `npm test` / `test:coverage` | **Jest** (`jest-expo`) | NÃO VERIFICADO — **nunca rodou** |
| `npm run logic-check` | `tsc` + testes de lógica via shim | VERIFICADO apenas no ambiente de origem |
| `npm run verify` | typecheck + lint + format:check + test | NÃO VERIFICADO |

## 6. Variáveis de ambiente (somente nomes — **nunca** coloque valores no repositório)

**No app** (arquivo `.env` na raiz, **ignorado pelo Git**; modelo em `.env.example`):

`APP_ENV` · `SUPABASE_URL` · `SUPABASE_PUBLISHABLE_KEY` · `TURNSTILE_SITE_KEY` · `TURNSTILE_PAGE_URL`

- `app.config.ts` lê estas variáveis e `src/config/parseConfig.ts` **falha na inicialização** (com mensagem `Config: ...`) se faltar `APP_ENV`, `SUPABASE_URL` ou `SUPABASE_PUBLISHABLE_KEY`, se a URL não for `https` (só `http` em `localhost`, `127.0.0.1`, `10.0.2.2` com `APP_ENV=development`), ou se a chave parecer `service_role`/`sb_secret_`. Isso é intencional.
- Quais arquivos `.env*` o Expo SDK 57 carrega em cada modo: **[NÃO VERIFICADO]**. Comece com um único `.env`.
- O app só deve receber valores **públicos por design**. **Nunca** `service_role`/secret key no app.

**Fora do app** (Supabase Auth / Edge Functions / CLI — não vão em `.env` do app):

`SMTP_HOST` · `SMTP_PORT` · `SMTP_USER` · `SMTP_PASS` · `SMTP_SENDER` · `TURNSTILE_SECRET` · `MAIL_PROVIDER` · `SERVICE_ROLE_KEY` (ou `SECRET_KEY`)

**Só para `scripts/spike_auth_hook.sh`:** `DB_URL`, `API_URL`, `ANON_KEY` (ou `PUBLISHABLE_KEY`), `SERVICE_ROLE_KEY` (ou `SECRET_KEY`), `SPIKE_PASSWORD` (opcional; se ausente, uma senha descartável é gerada por execução). Os nomes das variáveis que o Supabase CLI imprime podem variar por versão **[NÃO VERIFICADO]**.

## 7. Executar o app em um Android físico

Pré-requisito: os passos de §4 sem erro e um `.env` válido (§6).

1. No celular: **Opções do desenvolvedor** (toque 7 vezes em *Número da versão*) → ative **Depuração USB**.
2. Conecte por USB e aceite o prompt de chave RSA no celular.
3. No PowerShell (ajuste o caminho se o SDK estiver em outro lugar):
   ```powershell
   $env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
   $env:Path += ";$env:ANDROID_HOME\platform-tools"
   adb devices          # deve listar o aparelho como "device" (não "unauthorized" nem vazio)
   ```
4. Build de **Development Build** (Expo Go **não** é suportado) e instalação no aparelho:
   ```powershell
   npx expo run:android      # gera a pasta android/ (ignorada pelo Git) e instala o app; primeira vez é lenta
   ```
5. Inicie o Metro para o dev client:
   ```powershell
   npm start
   ```
6. Se o app não alcançar o Metro por USB: `adb reverse tcp:8081 tcp:8081` **[NÃO VERIFICADO]**.
7. **Supabase local a partir do celular:** `127.0.0.1` no celular não é o seu PC. Com USB, use `adb reverse tcp:54321 tcp:54321` e deixe `SUPABASE_URL=http://127.0.0.1:54321` (a validação de config só aceita `http` para esses hosts em `development`). Se o Android bloqueia tráfego HTTP em texto claro no build de desenvolvimento: **[NÃO VERIFICADO]**.

**O que você verá hoje:** as telas são *placeholders* (`PlaceholderScreen`) e o estado de acesso é fixo em `SIGNED_OUT` (Fase 1). Não há login, timer nem Points. Nenhuma tela foi renderizada em qualquer ambiente até agora.

## 8. Supabase local, migrations e spike (opcional nesta etapa)

```powershell
npx supabase start            # exige Docker Desktop; usa supabase/config.toml (NÃO VERIFICADO)
npx supabase db reset         # aplica supabase/migrations/* — NUNCA foram executadas em PostgreSQL
```

O spike do Auth Hook usa Bash (`curl`, `jq`, `psql`). Rode no **Git Bash** ou **WSL**:

```bash
# habilite [auth.hook.custom_access_token] em supabase/config.toml antes
./scripts/spike_auth_hook.sh 2>&1 | tee spike.log
```

Não foi executado em nenhum ambiente (apenas `bash -n`). O spike de atestação (`docs/spikes/attestation-spike.md`) está **inteiro NÃO EXECUTADO** (0 PASS, 0 FAIL, 25 NÃO EXECUTADO).

## 9. O que me devolver depois de rodar

1. Versões reais: `node -v`, `npm -v`, `npx tsc -v`, `npx expo --version`.
2. Saída completa (inclusive **erros**) de: `npm install` e dos comandos de §4; `npm run verify`; `npm run logic-check`.
3. O `package-lock.json` (ou `npm ls --depth=0`) e **qual versão pinada não existiu**, se alguma.
4. Resultado de `npx expo run:android` e `adb devices`.
5. `db-reset.log` e `spike.log`, se você executar a §8.

## 10. Segurança

- **Não commite** `.env*` (exceto `.env.example`), chaves, tokens, senhas ou arquivos `.jks/.keystore/.p8/.p12/.pem/.key` (já ignorados pelo `.gitignore`).
- O ZIP **não contém** segredos. Literais que parecem segredos no código são **fixtures de teste** (JWT de exemplo em `redact.test.ts`; a senha de exemplo da especificação, `Private@123`, em `password.test.ts`).
