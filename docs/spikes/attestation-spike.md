# Spike de atestação — Play Integrity (Android) e App Attest (iOS)

> **Status (04/10/2026): ESPECIFICAÇÃO DE SPIKE — NENHUM EXPERIMENTO FOI EXECUTADO** (ver §13: todos `NÃO EXECUTADO — motivo`). Nada foi implementado. Este documento define o que investigar, como medir e o que decide. Pesquisa documental feita em 03/10/2026; **nenhum aparelho, conta de loja ou servidor** foi usado.
> Decisão arquitetural **preliminar** registrada: **C — atestação** (ver [beacon-analysis.md](../beacon-analysis.md)). A arquitetura definitiva de recompensa **só é aprovada depois da revisão do resultado deste spike**.
> Prioridade: **integridade dos Points > conveniência > completude.**

Legenda: **[DOC]** documentação oficial do fabricante consultada. **[SEC]** fonte secundária (blog, README, fórum): indício, não garantia. **[?]** não sabemos; o spike deve medir. Nada é preenchido por suposição.

---

## 0. Escopo e regras que NÃO mudam

A atestação é **uma camada adicional**; não substitui nada abaixo.

- Relógio do servidor continua sendo a autoridade temporal.
- O cliente não tem autoridade sobre `state`, `end_reason`, Points ou autorização de crédito.
- `UNVERIFIED` continua terminal, sem recompensa e sem caminho de promoção.
- Idempotência do crédito; uma execução ativa por conta; sessão única; associação execução ↔ sessão de dispositivo; proteção contra replay.
- Evidências de lifecycle e **classificação server-side** de ausências (D26) permanecem.
- **Economia inalterada:** Estudo 100, Modo Foco 200, 1.000 iniciais após confirmação de e-mail. Duração e regras dos timers inalteradas.
- **Não se decide** neste spike que `sem atestação → UNVERIFIED`. Isso é decisão de produto **depois** do resultado (§9).

## 1. O que a atestação pode e não pode provar (declaração de garantias)

Princípio da sua regra: *não escolher pela existência de uma API com o nome; saber exatamente qual garantia ela dá no nosso fluxo e qual ataque ela realmente impede.*

| Pergunta | Resposta com base nas fontes |
|---|---|
| Prova que o usuário **estudou** ou ficou no Modo Foco? | **Não.** Nenhuma das duas APIs mede comportamento humano |
| Prova **presença humana**? | **Não.** O próprio Google descreve abusadores que geram atestações válidas em aparelhos reais e as entregam a bots [DOC] |
| O que ela **pode** aumentar | A confiança de que **uma requisição** veio de uma **instalação do app genuíno**, em aparelho que o fabricante da plataforma considera íntegro, **naquele momento**, com conteúdo vinculado (hash/desafio) e frescor |
| O que ela **não** cobre no tempo | Atesta o **instante da requisição**, não os 30 minutos anteriores. A continuidade durante a execução continua sendo **sinal** reportado pelo app (que passa a vir de um app genuíno, quando exigido) |
| Ataques que **pode** impedir (a confirmar) | Script sem app (F1), app reempacotado/modificado (F2), replay de requisição |
| Ataques que **não** impede | Fazenda de aparelhos reais (F4), relay de desafios para aparelho real (a medir), usuário que não estuda (F3), instrumentação em aparelho que ainda passa na verificação (corrida armamentista) |

`COMPLETED` continua significando: *evidência suficiente, segundo as regras da V1, para aceitar a execução e creditar* — **não** "o servidor provou que o usuário estudou".

## 2. Android — Play Integrity API: fatos documentados

| # | Fato | Fonte |
|---|---|---|
| A1 | Verifica que a requisição vem do **app genuíno instalado pelo Google Play**, em dispositivo Android **certificado/genuíno**; usa sinais com respaldo de hardware | [DOC] developer.android.com/google/play/integrity/overview |
| A2 | Veredictos: `appIntegrity` (`appRecognitionVerdict`, esperado `PLAY_RECOGNIZED`), `accountDetails` (`appLicensingVerdict`, esperado `LICENSED`), `deviceIntegrity` (rótulos `MEETS_BASIC_INTEGRITY`, `MEETS_DEVICE_INTEGRITY`, `MEETS_STRONG_INTEGRITY`) | [DOC] |
| A3 | Veredictos opcionais (opt-in no Play Console): `appAccessRiskVerdict` (apps que capturam tela/sobrepõem/controlam o aparelho, ex.: acessibilidade), `playProtectVerdict`, `recentDeviceActivity` (volume anômalo de requisições), `deviceRecall` (beta) | [DOC] |
| A4 | **Padrão (standard):** exige *warm-up* (alguns segundos), latência de centenas de ms; proteção contra replay "automática pelo Google Play"; vínculo de conteúdo por `requestHash`. **Clássico:** latência de segundos; `nonce` do servidor e lógica própria contra replay; nova avaliação a cada requisição | [DOC] |
| A5 | `requestHash`/`nonce` ficam em texto claro para o app e para o Google; deve-se aplicar hash/cifrar antes | [DOC] |
| A6 | **Não** fazer cache de veredictos (risco de *proxying*: reutilizar veredicto de um bom aparelho em outro ambiente) | [DOC] |
| A7 | Cota padrão: **10.000 requisições/dia no total de instalações**; aumento por solicitação | [DOC] |
| A8 | Recomenda-se **coletar telemetria sem impor** antes de aplicar enforcement e ter estratégia em camadas; "não use como único mecanismo antifraude" | [DOC] |
| A9 | Abusadores de alto volume "geram resultados válidos de aparelhos reais e os entregam a bots"; `recentDeviceActivity` serve para detectar | [DOC] |
| A10 | Há página de códigos de erro e dashboard de status; o servidor deve ter plano para indisponibilidade do serviço | [DOC] |
| A11 | Requisitos de Google Play: Play Store e Google Play Services no aparelho (tabela de requisitos da página de requisição clássica) | [DOC] (leitura da página em espanhol) |
| A12 | Fora do Google Play o veredicto de app tende a ser `UNRECOGNIZED_VERSION` | [SEC] guia do wallet alemão (EUDI) |
| A13 | Verificação no servidor: decifrar/validar via API do Google (padrão); no clássico é possível obter chaves do Play Console para validar sem contatar o Google | [SEC] |
| A14 | Funciona em emuladores com Play Store (o veredicto de dispositivo é outra questão) | [SEC] README `expo-app-integrity` |

**Lacunas [?]:** trilhas de teste interno/fechado do Play devolvem `PLAY_RECOGNIZED`? build de desenvolvimento assinado pelo EAS devolve o quê? token exige rede? exatamente quais rótulos um emulador/aparelho com bootloader destravado devolve? tamanho máximo real do `requestHash`.

## 3. iOS — App Attest: fatos documentados

| # | Fato | Fonte |
|---|---|---|
| I1 | Modelo: `isSupported` → `generateKey` → `attestKey(keyId, clientDataHash)` com **desafio de uso único do servidor** → servidor valida a atestação (cadeia de certificados Apple, App ID, contador, `aaguid`, recibo) → `generateAssertion` por requisição; servidor exige **contador estritamente crescente** | [DOC] Apple (WWDC21/26, "Validating apps that connect to your server") |
| I2 | **Validar no servidor, não no aparelho**; incluir desafio de uso único contra replay de rede | [DOC] WWDC21 |
| I3 | Asserções são geradas **no aparelho** e validadas no servidor | [DOC] WWDC21 |
| I4 | Tratar `isSupported == false`, *throttling* durante a introdução e falhas de rede | [DOC] WWDC21 |
| I5 | O recibo da atestação permite obter, via servidor Apple, uma **métrica de risco** depois | [DOC] WWDC21 (detalhes da métrica: [?]) |
| I6 | Ambientes: **sandbox/desenvolvimento** (padrão em desenvolvimento) × **produção**. Após distribuição por **TestFlight, App Store ou Enterprise o app usa produção, ignorando o entitlement**. `aaguid` = `appattestdevelop` (dev) ou `appattest`+7 bytes `0x00` (produção); chaves de um ambiente não valem no outro | [DOC] Apple (entitlement e "Preparing to use…") |
| I7 | **Não funciona no Simulador**; a maioria das extensões de app não suporta | [DOC] Expo (`@expo/app-integrity`) |
| I8 | iOS 14+ | [SEC] (pub.dev / blogs) |
| I9 | Apple recomenda subir a adoção gradualmente (citado: ≤ 10 milhões de usuários/dia por app) | [SEC] fórum Apple citando a documentação |
| I10 | `attestKey` contata a Apple (medido ≈ 5 s num relato de fórum) | [SEC] |

**Lacunas [?]:** a chave sobrevive a reinstalação/restauração de backup/troca de aparelho? o app consegue gerar asserção **totalmente offline** e o servidor aceitar depois? o que o recibo/métrica diz sobre muitas chaves por aparelho? a atestação diz algo sobre jailbreak? limites reais de *throttling*; comportamento em Mac Catalyst/iPad.

## 4. Integração com Expo (Development Build / módulo nativo)

- Existe a biblioteca **oficial `@expo/app-integrity`** [DOC] docs.expo.dev: usa Play Integrity (fluxo **standard**) e App Attest; ajuda o servidor a distinguir instalações legítimas de clientes não autorizados/apps modificados/scripts (descrição do fornecedor). Existe também `expo-app-integrity` de terceiros (Play Integrity **clássico** + App Attest; exige workflow bare) [SEC].
- **[?] a verificar no spike, antes de adotar qualquer biblioteca** (regra: *não escolher só porque existe*):
  1. É compatível com **Expo SDK 57** e com o nosso Development Build?
  2. Expõe o **`requestHash`** (Android standard) e o **`clientDataHash`/desafio** (iOS) para vincularmos conteúdo e execução? Ou só devolve um token "genérico"?
  3. Permite escolher **clássico × standard**?
  4. Onde persiste o `keyId` do iOS (e o que acontece em reinstalação)?
  5. Expõe os códigos de erro do Android e o `isSupported` do iOS de forma utilizável para telemetria?
  6. Se não cobrir tudo: escrever módulo próprio com o Expo Modules API (esforço maior).
- O módulo nativo `pp-platform` já previsto pode hospedar a atestação se a biblioteca não servir.

## 5. Matriz de capacidades (somente o documentado; o resto é `?`)

> **Atualização 04/10/2026:** nenhuma célula `?` foi alterada, porque **nenhum experimento foi executado**. `?` continua significando *não sabemos* — não *provavelmente sim/não*.

| Capacidade | Android (Play Integrity) | iOS (App Attest) |
|---|---|---|
| Identificar app legítimo | **[DOC]** `appRecognitionVerdict = PLAY_RECOGNIZED` (+ `appLicensingVerdict = LICENSED`); exige app **instalado pelo Google Play** | **[DOC]** servidor valida o App ID (Team ID + bundle) na atestação e a cadeia de certificados Apple |
| Vincular ao dispositivo/sessão | **?** Não há chave persistente por instalação na API; vínculo seria só por **conteúdo** (`requestHash`/`nonce` contendo id da sessão). `deviceRecall` é beta. Medir se existe algum identificador estável | **[DOC]** `keyId` por instalação, associável a conta/sessão no servidor; asserções assinadas com essa chave |
| Vincular à execução | **[DOC/mecanismo]** via conteúdo no `requestHash`/`nonce` (id da execução); **eficácia a medir** | **[DOC/mecanismo]** via `clientDataHash` com desafio + id da execução; **eficácia a medir** |
| Challenge/nonce | **[DOC]** standard: `requestHash` (hash calculado pelo app); clássico: `nonce` **do servidor**. Para frescor server-side no standard é preciso colocar um desafio do servidor **dentro** do hash | **[DOC]** desafio de uso único emitido pelo servidor, dentro do `clientDataHash` |
| Proteção contra replay | **[DOC]** standard: mitigação automática do Google Play; clássico: nonce + lógica do servidor. **Além disso**, nosso desafio de uso único | **[DOC]** desafio de uso único + **contador estritamente crescente** |
| Funciona offline? | **?** Token exige serviços Google; [SEC] indica que exige rede. Medir | **?** [DOC] asserções são geradas no aparelho; `attestKey` (matrícula) exige rede. Medir asserção sem rede + aceitação posterior |
| Funciona em Development Build? | **?** uma fonte secundária cita `UNRECOGNIZED_VERSION` fora do Play (**não observado por nós**); medir o que é devolvido (inclusive rótulos de dispositivo) | **[DOC]** sim, em aparelho real, ambiente **sandbox** (`appattestdevelop`); **não** no Simulador |
| Funciona em distribuição de teste? | **?** trilhas de teste do Play (interno/fechado/aberto): medir se devolvem `PLAY_RECOGNIZED` | **[DOC]** **TestFlight usa produção** (ignora o entitlement) |
| Funciona em produção? | **[DOC]** é o caso suportado (app instalado pelo Play) | **[DOC]** sim (produção, `aaguid = appattest`) |
| Pode falhar legitimamente? | **[DOC]** sim: códigos de erro, sem Play Store/Play Services, sem rede, cota, indisponibilidade do serviço, build não reconhecido, aparelho não certificado | **[DOC]** sim: `isSupported == false`, *throttling*, falha de rede; Simulador; extensões |
| O que o servidor realmente prova? | Que **aquela requisição** (conteúdo atrelado pelo hash/nonce, fresca) veio de um app com certificado reconhecido pelo Play, em aparelho com os rótulos devolvidos, **naquele instante**. **Não** prova permanência, estudo nem humano | Que **aquela asserção** foi assinada por uma chave atestada pela Apple como pertencente a **esta instalação** do app (App ID), com desafio fresco e contador novo. **Não** prova permanência, estudo, humano, nem (a verificar) integridade contra jailbreak |

## 6. Modelo de vínculo a ser TESTADO (rascunho do spike, não é migration nem decisão)

**Entidades de rascunho** (descartáveis): `attestation_challenges(id, account_id, device_session_id, execution_id?, purpose, challenge_hash, expires_at, consumed_at)`; `attested_keys(key_id, account_id, device_session_id, platform='ios', public_key, counter, env, created_at)`; `attestation_events(execution_id, platform, verdict_summary, request_binding_ok, at)` (somente o **resumo** do veredicto, sem token cru).

**Fluxo-alvo (hipótese a validar):**
1. Servidor emite um **desafio** (aleatório, ≥ 128 bits) ligado a `account_id` + `device_session_id` + `execution_id` + propósito (`START`, `SIGNALS`), com expiração curta e **uso único**.
2. O app calcula `digest = SHA-256(desafio ‖ execution_id ‖ digest_canônico_do_lote_de_eventos)` e:
   - **Android:** passa o `digest` como `requestHash` (standard) ou usa o desafio como `nonce` (clássico) e obtém o token;
   - **iOS:** usa o `digest` como `clientDataHash` e gera a **asserção** com a chave atestada.
3. O app envia à RPC/Edge Function: **evidência** (eventos brutos) + **atestação**. Nenhuma decisão.
4. O servidor: consome o desafio (uso único, não expirado, ligado à sessão/execução), **recalcula o digest** do lote recebido, valida a atestação (Google API / validação X.509 e contador Apple), confere identidade do app e ambiente, e **registra** `request_binding_ok` e o resumo do veredicto como **mais uma evidência** — **não** como decisão.
5. `reconcile_execution` (a regra de crédito) **continua sendo do servidor** e usa a atestação **só se/quando** a política for definida (§9).

**Pontos a investigar (suas listas):** replay (token reaproveitado em outra requisição/conta/execução); **expiração** (janela do desafio vs. latência móvel); **rotação/reuso** (Android: um token por requisição, sem cache; iOS: mesma chave por instalação, contador crescente); associação com `device_session` (troca de sessão revoga chave? reinstalação gera nova chave?) e com `task_execution`.

**Quais ações atestar** (a decidir com dados do spike): login/sessão de dispositivo; `start_task`; envio de sinais; reconciliação final. **Cota Android:** com 10.000/dia por padrão [DOC A7], cada atestação por execução consome cota — medir o consumo por execução e o impacto de pedir aumento.

## 7. Experimentos

Cada experimento: **hipótese → procedimento → critério → resultado `_preencher_`**. Fazer em aparelhos de teste próprios.

### Android
| ID | Experimento | Critério / o que medir |
|---|---|---|
| A-1 | Telemetria **sem enforcement**: pedir token (standard e clássico) em Development Build (EAS) | Veredictos devolvidos (app/conta/dispositivo), erros, latência, tamanho do `requestHash` |
| A-2 | Mesmo build **enviado ao Play** (teste interno → fechado → produção-teste) | `appRecognitionVerdict`/`appLicensingVerdict` em cada trilha; chave de assinatura (upload × Play App Signing) |
| A-3 | **Sideload** do APK de release | Rótulos devolvidos fora do Play |
| A-4 | Aparelho **sem Google Play Services**; emulador **com** Play; aparelho com **bootloader destravado/root**; ROM customizada | Que rótulos de dispositivo/erros aparecem; quais casos legítimos falham |
| A-5 | **Replay:** reaproveitar o mesmo token em outra requisição / outra conta / outra execução | Servidor deve rejeitar (hash/desafio/uso único) |
| A-6 | **Relay:** script obtém desafio do servidor e o repassa a um app genuíno em aparelho real, devolvendo o token | Se o servidor aceita (resultado **a medir**); medir `recentDeviceActivity` e viabilidade de detecção |
| A-7 | **App reempacotado** (re-assinado) | `appRecognitionVerdict` ≠ `PLAY_RECOGNIZED` |
| A-8 | **Instrumentação** (ex.: Frida) em aparelho que ainda devolve rótulos fortes | Atestação não deve bloquear a omissão de `BACKGROUND`; confirmar o limite |
| A-9 | **Offline:** pedir token sem rede; pedir token e enviar depois | Exige rede? token expira? |
| A-10 | **Cota:** simular volume e medir erros ao se aproximar de 10.000/dia | Comportamento ao estourar |
| A-11 | `appAccessRiskVerdict` com app de acessibilidade/overlay ativo | Efeito sobre usuários legítimos (acessibilidade real) |

### iOS
| ID | Experimento | Critério / o que medir |
|---|---|---|
| I-1 | Development Build em aparelho real: `isSupported`, `generateKey`, `attestKey`, `generateAssertion` | Funciona no sandbox; `aaguid = appattestdevelop`; **Simulador falha** |
| I-2 | Servidor valida atestação e asserção (cadeia, App ID, desafio, contador) | Rejeita desafio reutilizado, contador não crescente, App ID errado |
| I-3 | **TestFlight** | Usa produção (`aaguid = appattest`); chaves de dev não valem |
| I-4 | **Reinstalação / restauração / novo aparelho** | O `keyId` sobrevive? precisa nova matrícula? |
| I-5 | **Offline:** gerar asserção sem rede e enviar depois | Servidor aceita? contador? |
| I-6 | **Replay** de asserção em outra requisição/execução/conta | Rejeitado |
| I-7 | **Relay** (como A-6) | Mesmo teste de viabilidade |
| I-8 | Aparelho sem suporte / iOS antigo / Mac Catalyst / iPad | Comportamento de `isSupported` |
| I-9 | *Throttling* e latência da matrícula (≈ 5 s relatado) em rede móvel ruim | UX da primeira matrícula |
| I-10 | Recibo → métrica de risco (servidor Apple) | O que a métrica realmente informa |
| I-11 | Aparelho com jailbreak (se disponível ao laboratório) | A atestação muda? (**não presumir**) |

### Transversais
| ID | Experimento | Critério |
|---|---|---|
| X-1 | Integração com `reconcile_execution` **em modo observação**: gravar o resumo da atestação como evidência sem alterar nenhum resultado | Distribuição de resultados na população de teste |
| X-2 | Biblioteca candidata (`@expo/app-integrity` ou módulo próprio): checklist §4 | Cobre `requestHash`/`clientDataHash`? compatível SDK 57? |
| X-3 | Falha do serviço de atestação (simulada) | O app continua funcionando? o que acontece com a recompensa? |

## 8. Ataques × o que o spike deve mostrar (nenhuma célula preenchida)

| Ataque | Android: o que a atestação faz? | iOS: o que a atestação faz? |
|---|---|---|
| F1 — script sem aparelho | ? (A-5, A-7) | ? (I-2, I-6) |
| F2 — app modificado/reempacotado | ? (A-7) | ? (I-2) |
| F2' — app genuíno com instrumentação em aparelho íntegro | ? (A-8) | ? (I-11) |
| F4 — fazenda de aparelhos reais | ? (A-6, A-10; `recentDeviceActivity`) | ? (I-7, I-10) |
| Relay de desafios | ? (A-6) | ? (I-7) |
| Reuso/replay | ? (A-5) | ? (I-6) |
| F3 — usuário não estuda | **fora do alcance** | **fora do alcance** |

## 9. Questões de produto que o spike deve alimentar (sem decidir agora)

| # | Pergunta | Como o spike responde |
|---|---|---|
| 1 | O que conseguimos atestar no Android? | §2, A-1…A-4, A-7 |
| 2 | E no iOS? | §3, I-1…I-4, I-8 |
| 3 | Em quais aparelhos/distribuições funciona? | A-2, A-3, A-4, I-3, I-8 |
| 4 | Quais casos legítimos falham? | A-4, A-9, A-10, A-11, I-8, I-9, X-3 |
| 5 | O app pode funcionar sem atestação? | Verificar tecnicamente que login, Home e leitura funcionam; o que é atestado é só o que gera recompensa (X-1) |
| 6 | Dá para restringir **somente a recompensa**? | X-1: a atestação como evidência na reconciliação, sem bloquear o app |
| 7 | Qual a experiência do usuário em cada caso? | Mapear telas/mensagens para: atestação ok, indisponível, falhou, serviço fora |

**Candidatos de política (nenhum decidido; fora do escopo do spike escolher):** (a) atestação como **exigência** para `COMPLETED` (sem ela ⇒ `UNVERIFIED`); (b) como **evidência adicional** que apenas aumenta a confiança, sem bloquear; (c) enforcement em camadas por rótulo de dispositivo; (d) exigência só para a recompensa do Foco. **Qualquer** escolha altera o produto e será proposta com dados.

## 10. Pré-requisitos e custos (para você prover)

- **Apple:** conta Apple Developer (paga) com App Attest habilitado no App ID; ao menos 1 iPhone **real** com iOS 14+; acesso a TestFlight.
- **Google:** conta Play Console; projeto Google Cloud vinculado; app criado no Play com trilhas de teste interno/fechado; ao menos 1 Pixel (ou equivalente) com Play Services, 1 aparelho **sem** Google Play Services (se obtível), 1 emulador com Play.
- **Servidor de spike:** projeto Supabase descartável com Edge Function de protótipo e tabelas de rascunho (§6).
- Responsabilidade legal/ética: testes de instrumentação/relay **somente** em aparelhos e contas próprios.

## 11. Entregáveis e critérios de saída

1. Esta matriz (§5) **totalmente preenchida com observações**, sem `?`.
2. Tabela de ataques (§8) preenchida.
3. Resultado de A-1…A-11, I-1…I-11, X-1…X-3.
4. Decisão técnica sobre a **biblioteca** (oficial, terceiros ou módulo próprio) com justificativa pelo checklist §4.
5. Proposta de política de recompensa **com dados** (§9), para a sua aprovação.
6. Estimativa de custo/cota (consumo de tokens por execução × 10.000/dia).

O spike termina quando cada garantia em §1 estiver **observada**, e cada ataque em §8 tiver resultado. **Nenhuma implementação definitiva** antes da sua revisão.

## 12. Fontes consultadas (03/10/2026)

- Google — *Overview of the Play Integrity API* (atualizado 2026-04-20): developer.android.com/google/play/integrity/overview · *Make a classic API request*: developer.android.com/google/play/integrity/classic
- Apple — *Preparing to use the App Attest service*; *Validating apps that connect to your server*; entitlement `com.apple.developer.devicecheck.appattest-environment`; WWDC21 "Mitigate fraud with App Attest and DeviceCheck"; WWDC26 "Secure your apps with App Attest" (developer.apple.com)
- Expo — `@expo/app-integrity`: docs.expo.dev/versions/latest/sdk/app-integrity
- [SEC] German EUDI Wallet — *Establishing app integrity*; README `expo-app-integrity`; fóruns e blogs citados nas linhas marcadas

---

## 13. Registro de execução (04/10/2026)

### 13.1 Ambiente desta sessão e o que isso significa

O spike deveria ser executado "em ambiente real". **Este ambiente não é um ambiente real para o spike.** Fatos verificados nesta sessão: sem acesso à rede (`npm view` retorna 403), sem Docker, sem PostgreSQL, sem Supabase CLI/projeto, **sem aparelho Android ou iOS**, **sem conta Apple Developer**, **sem Play Console / projeto Google Cloud**, sem TestFlight, sem trilha de teste do Play. O que existiu nesta sessão foi **pesquisa documental** (§2–§4), não execução.

Portanto **nenhum experimento foi executado**. Isto é um resultado válido do spike, mas **não é evidência positiva** de nada. Nenhum `?` da matriz (§5) ou da tabela de ataques (§8) foi preenchido, e nenhuma palavra do tipo "provavelmente" foi usada para substituí-los.

Códigos de motivo usados abaixo:

| Código | Motivo |
|---|---|
| **M1** | Sem rede neste ambiente (não instala dependências, não acessa serviços Google/Apple/Expo) |
| **M2** | Sem aparelho Android físico (nem emulador com Play Store) |
| **M3** | Sem aparelho iOS físico (App Attest não funciona no Simulador) |
| **M4** | Sem Play Console / projeto Google Cloud vinculado / trilha de teste do Play |
| **M5** | Sem conta Apple Developer (App ID com App Attest, TestFlight) |
| **M6** | Sem projeto Supabase / Edge Function de protótipo para validação server-side |
| **M7** | Sem aparelho Android com Google Play Services ausente, bootloader destravado/root ou ROM customizada |
| **M8** | Sem ferramenta de instrumentação e aparelho de laboratório apropriado |

### 13.2 Resultados por experimento

Colunas: ambiente · versão do SO · versão do app/build · SDK relevante · distribuição · resultado · resultado bruto · interpretação · limitações · novos riscos. Como nenhum foi executado, as colunas de ambiente/SO/build/SDK/distribuição/bruto/interpretação valem `—`; a coluna *Resultado* traz o motivo.

#### Android

| ID | Ambiente / SO / build / SDK / distribuição | Resultado | Bruto | Interpretação | Limitações | Novos riscos |
|---|---|---|---|---|---|---|
| A-1 | — / — / — / — / — | **NÃO EXECUTADO — M1, M2, M4** | — | nenhuma | — | — |
| A-2 | — | **NÃO EXECUTADO — M1, M2, M4** | — | nenhuma | — | — |
| A-3 | — | **NÃO EXECUTADO — M1, M2** | — | nenhuma | — | — |
| A-4 | — | **NÃO EXECUTADO — M2, M7** | — | nenhuma | — | — |
| A-5 | — | **NÃO EXECUTADO — M1, M2, M4, M6** | — | nenhuma | — | — |
| A-6 | — | **NÃO EXECUTADO — M2, M4, M6** | — | nenhuma | — | — |
| A-7 | — | **NÃO EXECUTADO — M1, M2, M4** | — | nenhuma | — | — |
| A-8 | — | **NÃO EXECUTADO — M2, M7, M8** | — | nenhuma | — | — |
| A-9 | — | **NÃO EXECUTADO — M2, M4** | — | nenhuma | — | — |
| A-10 | — | **NÃO EXECUTADO — M4, M6** | — | nenhuma | — | — |
| A-11 | — | **NÃO EXECUTADO — M2, M4** | — | nenhuma | — | — |

#### iOS

| ID | Ambiente / SO / build / SDK / distribuição | Resultado | Bruto | Interpretação | Limitações | Novos riscos |
|---|---|---|---|---|---|---|
| I-1 | — | **NÃO EXECUTADO — M1, M3, M5** | — | nenhuma | — | — |
| I-2 | — | **NÃO EXECUTADO — M3, M5, M6** | — | nenhuma | — | — |
| I-3 | — | **NÃO EXECUTADO — M3, M5** | — | nenhuma | — | — |
| I-4 | — | **NÃO EXECUTADO — M3, M5** | — | nenhuma | — | — |
| I-5 | — | **NÃO EXECUTADO — M3, M5, M6** | — | nenhuma | — | — |
| I-6 | — | **NÃO EXECUTADO — M3, M5, M6** | — | nenhuma | — | — |
| I-7 | — | **NÃO EXECUTADO — M3, M5, M6** | — | nenhuma | — | — |
| I-8 | — | **NÃO EXECUTADO — M3, M5** | — | nenhuma | — | — |
| I-9 | — | **NÃO EXECUTADO — M3, M5** | — | nenhuma | — | — |
| I-10 | — | **NÃO EXECUTADO — M3, M5, M6** | — | nenhuma | — | — |
| I-11 | — | **NÃO EXECUTADO — M3, M5, M8** | — | nenhuma | — | — |

#### Transversais

| ID | Ambiente / SO / build / SDK / distribuição | Resultado | Bruto | Interpretação | Limitações | Novos riscos |
|---|---|---|---|---|---|---|
| X-1 | — | **NÃO EXECUTADO — M2, M3, M6** (depende de A-1 e I-2) | — | nenhuma | — | — |
| X-2 | — | **NÃO EXECUTADO — M1** (não foi possível instalar nem inspecionar `@expo/app-integrity` nem verificar compatibilidade com o SDK 57 do projeto) | — | nenhuma | — | — |
| X-3 | — | **NÃO EXECUTADO — M2, M3, M6** | — | nenhuma | — | — |

**Contagem:** 25 experimentos · 0 PASS · 0 FAIL · **25 NÃO EXECUTADO**.

### 13.3 Perguntas prioritárias do spike × estado

| # | Pergunta prioritária | Experimentos que a respondem | Estado |
|---|---|---|---|
| 1 | Podemos obter atestação válida no **Android** no nosso stack/SDK? | A-1, X-2 | **NÃO RESPONDIDA** |
| 2 | Podemos obter atestação válida no **iOS** no nosso stack/SDK? | I-1, I-2, X-2 | **NÃO RESPONDIDA** |
| 3 | Conseguimos **vincular o desafio à execução** específica? | A-1/I-2 executados com desafio ligado a `execution_id`; A-5/I-6 provam que divergência é rejeitada | **NÃO RESPONDIDA** |
| 4 | Conseguimos **impedir replay**? | A-5, I-6 | **NÃO RESPONDIDA** |
| 5 | Conseguimos **validar tudo no servidor**? | A-1 (decodificação/validação do token), I-2 (cadeia, App ID, contador) | **NÃO RESPONDIDA** |
| 6 | Quais são os casos legítimos em que a atestação **não está disponível**? | A-4, A-9, A-11, I-8, I-9, X-3 | **NÃO RESPONDIDA** (a documentação lista categorias — §2/§3 —, nenhuma foi observada) |
| 7 | Comportamento em **Development Build, teste e produção**? | A-1, A-2, A-3, I-1, I-3 | **NÃO RESPONDIDA** (a documentação do iOS afirma TestFlight=produção; **não observado**) |
| 8 | **Impacto da cota** do Android? | A-10 | **NÃO RESPONDIDA** (a documentação informa 10.000/dia por padrão; impacto **não medido**) |
| 9 | **Reinstalação / rotação de chave**? | I-4 (e observação equivalente no Android em A-1) | **NÃO RESPONDIDA** |
| 10 | O que realmente concluímos sobre **dispositivo/app comprometido**? | A-6, A-7, A-8, I-7, I-11 | **NÃO RESPONDIDA** |

### 13.4 Conjunto mínimo se for preciso reduzir custo (perguntas 1–5)

Executar nesta ordem; cada item só faz sentido se o anterior passou:

1. **X-2** — instalar `@expo/app-integrity` no Development Build e conferir: SDK 57, `requestHash`/`clientDataHash` expostos, onde fica o `keyId`. Se não servir, decidir módulo próprio **antes** de gastar nos demais.
2. **A-1** — token Android em Development Build (telemetria, sem enforcement), com desafio do servidor dentro do `requestHash`, **validado no servidor**.
3. **I-1 + I-2** — App Attest em iPhone real (sandbox), com validação completa no servidor (cadeia Apple, App ID, `aaguid`, desafio, contador).
4. **A-5 + I-6** — replay (mesmo token/asserção em outra requisição, conta ou execução) e divergência do vínculo à execução.
5. Só então: A-2/A-3 e I-3 (build de teste e produção), A-4/I-8 (casos que falham), A-10 (cota), I-4 (reinstalação), e os de ataque (A-6, A-7, A-8, I-7, I-11), **somente em aparelhos, contas e projetos de teste próprios**.

### 13.5 Pré-requisitos mínimos que faltam (para o conjunto do §13.4)

- 1 iPhone **real** (iOS 14+), conta **Apple Developer** com App Attest habilitado no App ID, TestFlight para I-3.
- 1 aparelho Android **com Google Play Services**, conta **Play Console**, **projeto Google Cloud** vinculado, trilha de teste interno do Play para A-2.
- Máquina com rede para `eas build`/`expo run`, instalação de dependências e Supabase (local ou projeto de teste) para a função de protótipo de validação.
- Aparelhos adicionais só para A-4/A-8 (sem GMS, root/bootloader destravado).

### 13.6 Riscos identificados por LEITURA da documentação (nenhum foi observado em experimento)

> Estes itens **não** são resultados de experimento. São pontos que a leitura do §2–§4 sugere verificar; permanecem `?` como evidência.

| # | Risco | Origem | Experimento que o confirma/descarta |
|---|---|---|---|
| R-1 | A cota padrão de 10.000 requisições/dia (total de instalações) pode limitar a escala se cada execução exigir mais de uma atestação | [DOC] A7 | A-10 |
| R-2 | O Google descreve que atestações válidas de aparelhos reais podem ser repassadas a bots: C não impede **fazenda de aparelhos reais nem relay** | [DOC] A9 | A-6, I-7 |
| R-3 | iOS: sandbox × produção. O servidor precisa conferir o `aaguid` por ambiente; aceitar chaves de sandbox em produção por erro de configuração anularia a garantia. TestFlight usa produção | [DOC] I6 | I-1, I-2, I-3 |
| R-4 | Android: o veredicto de app depende de instalação pelo Google Play; builds de desenvolvimento podem não ser reconhecidos. Risco de *config drift* (relaxar a validação em produção para "funcionar" em dev) | [DOC] A1/A2, [SEC] A12 | A-1, A-2, A-3 |
| R-5 | A biblioteca oficial da Expo declara usar o fluxo *standard* do Play Integrity. Se não expuser `requestHash`, vincular o desafio à execução pode exigir módulo próprio | [DOC] Expo | X-2 |
| R-6 | A atestação refere-se ao **instante da requisição**, não aos 30 minutos da execução; risco de confiar demais nela como "prova de permanência" | §1 | (conceitual; confirmar nos resultados de X-1) |
| R-7 | Dependência de Google/Apple: indisponibilidade, *throttling* ou erros causam falsos negativos | [DOC] A10, I4 | X-3 |

### 13.7 Conclusão do registro

- **Nada foi validado.** A decisão C continua **preliminar e não validada**.
- **Nenhuma** alteração conceitual de arquitetura foi feita; **nenhuma** regra de produto mudou; `sem atestação ⇒ UNVERIFIED` continua **não decidido**.
- **Não há código de atestação**, experimental ou definitivo, neste repositório.
- Próximo passo: alguém com os pré-requisitos do §13.5 executar o §13.4 e devolver, **por experimento**: ambiente, versão do SO, versão do app/build, SDK, tipo de distribuição, resultado bruto, PASS/FAIL/NÃO EXECUTADO, interpretação, limitações e riscos.

## 14. Modelo para devolução de resultados (copiar por experimento)

```text
ID:                    (ex.: A-1)
Data/hora:
Executor:
Ambiente:              (aparelho/modelo; emulador? ; projeto Supabase; projeto Google Cloud/Apple Team)
Versão do SO:
Versão do app/build:   (versionName/buildNumber + commit)
SDK relevante:         (Expo SDK, @expo/app-integrity ou módulo próprio, versão do Play Integrity lib)
Distribuição:          Development Build | TestFlight | Play teste interno/fechado/aberto | Produção | sideload
Procedimento seguido:  (passos reais, desvios do §7)
Resultado bruto:       (veredictos/erros/HTTP; SEM tokens crus nem segredos — resumos)
PASS / FAIL / NÃO EXECUTADO — motivo:
Interpretação:         (o que isto prova; o que NÃO prova)
Limitações:
Novos riscos:
```

