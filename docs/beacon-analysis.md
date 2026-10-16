# Beacon Android — propriedades, pior caso de fraude e opções A/B/C

> **DECISÃO REGISTRADA (03/10/2026): C — atestação, como decisão arquitetural *preliminar*.**
> - **A** não é aceitável como solução final de integridade dos Points (o pior caso F1 demonstra farming automatizado).
> - **B** não deve ser adotada como mecanismo de segurança da economia (um script produz heartbeats).
> - **C** será investigada em **spike**, sem implementação definitiva: [spikes/attestation-spike.md](spikes/attestation-spike.md). Atestação **não prova que o usuário estudou**; é camada adicional. **Não** se decidiu `sem atestação ⇒ UNVERIFIED` (depende do spike). A arquitetura definitiva de recompensa só é aprovada após a revisão do resultado do spike.
> - O texto abaixo é o registro da análise que levou à decisão e permanece válido.

> Documento de **análise para decisão**. Nada aqui foi implementado nem decidido. Prioridade: **integridade dos Points > conveniência > completude**.
> Definição usada em todo o documento: `COMPLETED` na V1 = *o servidor aceitou a evidência disponível como suficiente, segundo as regras da V1, para creditar a execução* — **não** prova criptográfica de que o usuário permaneceu no Modo Foco ([timers.md §2.2](timers.md)).

## 1. As 8 propriedades verificadas antes de o beacon contribuir para `COMPLETED`

| # | Propriedade | Cliente fornece? | Servidor verifica independentemente? | Pode ser falsificada por cliente comprometido? | Necessária para `COMPLETED`? |
|---|---|---:|---:|---:|---:|
| 1 | Chamador autenticado e é a **sessão de dispositivo vigente** da conta | Sim (apresenta JWT/refresh token) | **Sim** (`require_session()` contra `device_sessions`) | **Não forja a credencial, mas o fraudador é o dono legítimo da conta**: ele tem o token. Não é barreira contra o próprio titular | Sim |
| 2 | A execução é da conta **e foi iniciada por esta sessão de dispositivo** | Sim (envia o `p_execution_id`) | **Sim** (consulta `task_executions.device_session_id`) | Não consegue apontar para execução alheia; **mas ele mesmo iniciou a execução** | Sim |
| 3 | A execução ainda está `RUNNING` (terminais são imutáveis) | Não | **Sim** (`FOR UPDATE` + retorno antecipado + trigger) | Não | Sim |
| 4 | Evento de tipo permitido e **somente** chaves da allowlist; sem campo de decisão | Sim (monta o payload) | **Sim** (`ingest_events` valida forma e tipos) | A **forma** não; o **conteúdo** (que sinais reporta) sim | Sim |
| 5 | Servidor **recebeu** o sinal em/após `ends_at` (relógio do Postgres, `>=` estrito) | Só escolhe **quando** enviar | **Sim** (`received_at`) | **Não pode antecipar** o relógio do servidor (não consegue creditar antes de `ends_at`); pode apenas esperar o tempo real passar, de qualquer lugar | Sim |
| 6 | Identidade `(process_instance_id, boot_id)` **igual** à informada no `start` | **Sim, as duas** | Só verifica **igualdade entre duas asserções do próprio cliente** | **Sim, trivialmente** (repete os mesmos valores) | Sim |
| 7 | Nenhuma violação registrada antes do fim; nenhum relato de identidade diferente antes do fim; ausências classificadas como compatíveis pelo servidor | **Sim** (todos os sinais brutos vêm dele) | O servidor **classifica**, mas só o que o cliente reportou | **Sim**: omitir o `BACKGROUND`, ou fabricar `SCREEN_LOCKED`/`CALL_STARTED` coerentes | Sim |
| 8 | Crédito idempotente, atômico, uma recompensa por execução, `TASK_REWARD` só para execução `COMPLETED` | Não | **Sim** (índices únicos, `credit_execution` sob lock, constraint trigger) | Não | Sim |

Leitura honesta da tabela: as propriedades **3, 5 e 8** (e a forma em **4**, e **1–2** como barreira contra terceiros) são verificadas **de verdade** pelo servidor. As propriedades **6 e 7** — as únicas que seriam "prova de que o app esteve vivo e o usuário ficou" — dependem **inteiramente** de o cliente dizer a verdade.

## 2. Qual fraude ainda é possível quando as 8 propriedades estão consistentes?

**Resposta direta: crédito indevido de Points é possível, de forma totalmente automatizada, sem celular, sem app e sem estudar.**

**F1 — Script sem dispositivo (pior caso, mais barato).** Um atacante com conta válida (e-mail confirmado, captcha resolvido no cadastro) executa um script que:
1. faz login (e-mail + senha) e obtém a sessão de dispositivo vigente (propriedade 1);
2. chama `start_task('STUDY_FOCUS', …)` informando um `process_instance_id` e um `boot_id` quaisquer (propriedade 6 satisfeita);
3. espera o tempo **real** do servidor passar (30 min; não dá para acelerar);
4. envia um `HEARTBEAT` com a mesma identidade, sem nenhum `BACKGROUND` (propriedades 5, 6, 7);
5. o servidor credita **200 Points** (`COMPLETED`), e o script reinicia o ciclo.

Nada no servidor distingue este script do app genuíno. **Os Points gerados são indevidos.** Limites que **existem**: uma execução ativa por conta (D08), relógio do servidor (não se antecipa), idempotência (não se duplica), 1 crédito por execução. Teto por conta: 48 execuções/dia × 200 = **9.600 Points/dia** (Foco) ou 4.800 (Normal). O ataque **escala por contas**: o único atrito é criar e confirmar contas (e-mail + Turnstile + limites de cadastro do Auth).

**F2 — App modificado em aparelho real.** Executa o Modo Foco usando outros apps e suprime os eventos `BACKGROUND` (ou fabrica `SCREEN_LOCKED`). Resultado: `COMPLETED` sem ter permanecido no Foco.

**F3 — App genuíno, usuário não estuda.** Deixa o aparelho parado com o Foco aberto. Nenhuma tecnologia lista aqui detecta isso; é fora do escopo técnico de qualquer opção.

**F4 — Fazenda de contas/aparelhos.** F1/F2 multiplicados; atestação (C) não impede aparelhos reais operados em massa.

**Vetor adicional independente do beacon:** o **crédito inicial de 1.000 Points por conta confirmada** (D19) já equivale a 5 execuções do Foco; farmar contas rende isso sem timer algum. Ele só é contido por atrito de cadastro (Turnstile, e-mail único, limites de taxa).

**O que a fraude NÃO consegue:** creditar antes de `ends_at`; creditar duas vezes a mesma execução; creditar execução `UNVERIFIED`/`EXPIRED`/`CANCELLED`/`INTERRUPTED`; enviar quantidade de Points; acessar a conta de outro usuário.

**Importância depende de uma pergunta de produto:** *os Points têm valor fora do app na V1 (sorteio, transferências, loja)?* A spec descreve a economia da V1 como experimental e esses recursos como futuros. Se o valor vier depois, **Points acumulados por fraude na V1 já estarão no ledger** — ele é append-only e a auditoria do V1 não distingue a origem.

## 3. Opções

### A — Manter como está

| | |
|---|---|
| **Protege contra** | Falhas **honestas/acidentais**: reinício, processo novo, perda de continuidade, relógio de parede errado; replay, concorrência e crédito duplicado; payload com campos de decisão (`completed`, `should_credit`…); classificação feita pelo cliente (removida); tentativa de concluir cedo; sessão de outro dispositivo; execuções de outras contas; qualquer promoção de `UNVERIFIED` |
| **Não protege contra** | **F1, F2, F4** (e F3). Um cliente comprometido que emita sinais coerentes recebe `COMPLETED` |
| **Plataformas** | Android e iOS iguais (o iOS suspenso credita quando o mesmo processo reporta, ≤ 7 dias) |
| **Complexidade adicional** | Nenhuma |

### B — Exigir série de heartbeats com lacunas máximas visíveis ao servidor (Android)

| | |
|---|---|
| **Melhora** | Eleva o custo da fraude de "um tiro só" (o script precisa emitir sinais periódicos coerentes); permite ao servidor observar **silêncio** (serviço morto) sem esperar um cold start, reduzindo `COMPLETED` para app que morreu no meio **em cenário honesto** |
| **Ainda não resolve** | **F1 continua trivial**: um `while sleep` envia os heartbeats; **F2**, **F4**, **F3**. Dá sensação de segurança maior do que a real contra atacante |
| **Efeitos negativos** | Falsos negativos honestos (Doze, rede, modo avião ⇒ lacuna ⇒ `UNVERIFIED`); mais bateria/dados; **altera o comportamento do Timer Normal no Android** (hoje: background/offline não invalidam) ⇒ **mudança de regra de produto**, exigiria decisão explícita |
| **Plataformas** | **Somente Android.** No iOS o app suspenso não envia heartbeat ⇒ regra **assimétrica** entre plataformas (também decisão de produto) |
| **Complexidade** | Moderada: política de lacuna (G), recuo/retry, testes de bateria/Doze |

### C — Atestação de integridade verificada no servidor (Play Integrity / App Attest)

| | |
|---|---|
| **Melhora** | O servidor passa a poder exigir que `start` e o sinal final venham de **uma instalação genuína e não modificada do app, em aparelho que passa nas verificações do sistema**. Elimina **F1** (script sem aparelho não produz atestação válida) e reduz muito **F2** (app reempacotado/modificado falha). Torna os sinais brutos (propriedade 7) **mais confiáveis**, porque quem os emite é o app genuíno |
| **Ainda não resolve** | **F3** e **F4** (aparelhos reais operados em massa), ataques por instrumentação em dispositivos que consigam passar a verificação (corrida armamentista), usuário que não estuda. **Não prova permanência no Foco**: atesta o app/aparelho, não o comportamento |
| **Android** | **Play Integrity API**: veredito verificado no servidor via API do Google (projeto Google Cloud, vínculo com a Play Console, *nonce* por requisição, cotas). Para o veredito completo de reconhecimento do app, o app tem de ser **distribuído pelo Google Play** (builds de desenvolvimento/sideload não passam) ⇒ impacta o fluxo de desenvolvimento e teste. Aparelhos sem Google Play Services (alguns fabricantes) ficariam sem atestação |
| **iOS** | **App Attest (DeviceCheck)**: iOS 14+, **somente aparelho real** (não funciona em simulador), chave por instalação gerada no Secure Enclave, verificação da cadeia de certificados Apple + *nonce* + contador de asserções no servidor; chave invalida em reinstalação/restauração. Não detecta jailbreak por si só |
| **Viável na V1 em Android e iOS?** | **Tecnicamente viável nos dois**, mas **não é pequeno**: o Expo exigiria módulo nativo (Expo Modules API) ou biblioteca de terceiros — **não verifiquei** nenhuma biblioteca pronta; o servidor precisa de endpoint de desafio, armazenamento de chaves/contadores, validação X.509/CBOR no Deno (iOS) e chamada à API do Google (Android); política de falha (atestação indisponível ⇒ `UNVERIFIED`, que **exclui** usuários legítimos sem GMS ou com problemas transitórios). Dependência operacional de Google e Apple (indisponibilidade ⇒ falsos negativos) |
| **Complexidade adicional** | **Alta** — merece fase própria, testes em aparelhos reais e revisão de privacidade |

### Quadro comparativo

| Critério | A | B | C |
|---|---|---|---|
| F1 script sem aparelho | ❌ | ❌ (trivial) | ✅ bloqueia |
| F2 app modificado | ❌ | ❌ | ✅ reduz muito |
| F3 usuário não estuda | ❌ | ❌ | ❌ |
| F4 fazenda de aparelhos reais | ❌ | ❌ | ❌ (não resolve) |
| Falsos negativos honestos | baixos | **mais** (Android) | **mais** (sem GMS, falhas) |
| Muda regra de produto | não | **sim** (Android) | não, mas exige política de falha |
| Plataformas | ambas | só Android | ambas (esforço duplo) |
| Complexidade | nenhuma | média | alta |

## 4. Perguntas que decidem (sem recomendação automática)

1. **Os Points terão valor fora do app na V1** (sorteio, transferências, loja)? Se não, o risco de A é contido; se sim, F1 invalida a integridade.
2. Se C for escolhida: **aceita-se `UNVERIFIED` para quem não consegue atestar** (sem GMS, atestação fora do ar)? E **a V1 sairia pela Play Store/TestFlight desde o início**?
3. **B** altera o Timer Normal no Android e cria assimetria com o iOS: isso é aceitável como regra de produto?
4. Medidas **operacionais** (teto diário por conta, monitoramento de padrões, liquidação adiada de Points) são regras de produto novas: não foram avaliadas nem alteradas aqui.

Observação final: **B não é uma resposta à fraude F1** e não deve ser apresentada como tal; entre A e C, a diferença decisiva é se a V1 precisa **resistir a um cliente comprometido**.
