# Private Points — Revisão de consistência (revisão 6)

Escopo: architecture, database, security, timers contra a spec CLAUDE-V1.0 e as decisões D01–D25. Gate: [phase1-gate.md](phase1-gate.md).

## 1. Correções desta rodada

| Pedido | Aplicação | Onde |
|---|---|---|
| Calibração ≠ prova de honestidade | Declarado em doc e código; a segurança da recompensa não depende da fórmula | timers §1.1, `clock.ts` |
| Margem de 2 s não é regra de negócio | Renomeada (`signalSendMarginMs`); SQL estrito `received_at >= ends_at`; teste de nomenclatura | timers §1.1, database R4, `clock.ts` |
| `UNVERIFIED` terminal, sem caminho de promoção | Busca final: nenhum caminho. Corrigido `credit_execution` (relê sob lock, exige `RUNNING`) e criado constraint trigger no ledger | security §12.2, database §0005 |
| Campos indiretos de autoridade | Allowlist estrita (cliente e SQL) + tripwire por radicais; tabela de todos os campos controlados pelo cliente; achado: `cause` | security §12/§12.1 |
| Beacon é evidência do cliente | 8 propriedades verificadas + o que não é provável; opções A/B/C para decisão | timers §7.7 |
| `process_instance_id`/`boot_id` são sinais | Declarado; não descritos como infalsificáveis | timers §7.1, architecture D11 |
| `cause`/classificações do cliente | **Removido.** Cliente reporta sinais brutos; servidor classifica (`absence_verdict`); ambiguidade ⇒ `UNVERIFIED`; comportamento de produto inalterado | timers §6, security §12.1, database, `focus/machine.ts`, `reference/absence.ts` |
| Definição de `COMPLETED`; sinais ≠ provas | Escrita em timers §2.2 e security §12.3; D27 | timers, security, architecture |
| Análise do beacon (8 propriedades, pior fraude, A/B/C) | Documento próprio, sem decisão | beacon-analysis.md |
| Decisão C (atestação) preliminar; A inaceitável como final; B não é segurança | D28; spike especificado, sem implementação; `sem atestação ⇒ UNVERIFIED` **não** decidido | architecture D28, beacon-analysis, spikes/attestation-spike.md |
| Execução só reportável pela sessão que a iniciou | `device_session_id = v_sess.id` em `reconcile_task`/`sync_active_execution` | database |
| Não alterar regras por limitação técnica | Nenhuma regra de produto alterada; consequências listadas para revisão | gate §2.6 |

## 2. Itens que dependem de decisão de produto (não decididos)

- ~~Beacon A/B/C~~ — **decidido: C preliminar** (D28). Seguem **não decididos**, dependentes do spike: política para quem não consegue atestar; se o app funciona sem atestação; se só a recompensa é restringida; quais ações exigem atestação; custo/cota.
- Consequências já conhecidas de limitações de plataforma (aguardando sua revisão, sem mudança silenciosa): iOS suspenso só credita quando o mesmo processo volta (≤ 7 dias); `UNVERIFIED` no Foco do iOS sem sinal de bloqueio; Android sem beacon recebido ⇒ `UNVERIFIED`; `cause` é atribuição do cliente.

## 3. Cobertura da spec

Inalterada. Nenhuma regra da especificação foi alterada.

## 4. Itens técnicos em aberto (todos NÃO VERIFICADOS)

A2 `FORCE ROW LEVEL SECURITY` × funções definer · A3 trigger de imutabilidade de `usernames` · A4 hook/`pg_cron`/expiração do link · A5 funções restantes (`logout`, `get_home`, `execution_json`, `finalize_account_deletion`) · A6 spikes de dispositivo · A7 `select … into` com `record` · A8 `authentication_method` e negação do hook · A9 `npm run verify` e migrations reais · **A11** o SQL de `absence_verdict` e de R1/R3 reescritos nunca executaram (paridade com o modelo TS pendente) · **A10** o constraint trigger diferido do ledger e o `credit_execution` endurecido nunca executaram.

## 5. Veredito

Os documentos estão consistentes entre si e com a spec. **Fase 1 aberta** (bloqueadores B1–B4 no gate). Fase 2 não iniciada.
