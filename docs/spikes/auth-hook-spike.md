# Spike — Supabase Auth Hook / sessão única

**Status: NÃO EXECUTADO.** Rodar `scripts/spike_auth_hook.sh` e colar a saída abaixo. O spike só é considerado concluído com `FALHAS: 0`.

## Perguntas obrigatórias

| # | Pergunta | Onde se observa | Resultado |
|---|---|---|---|
| Q1 | Valores **exatos** de `authentication_method` (cadastro/confirmação, senha, refresh, recuperação) | `spike.hook_events.auth_method` | _preencher_ |
| Q2 | `auth.sessions` existe e está disponível quando o hook executa? | `session_row_exists` | _preencher_ |
| Q3 | Ao negar: `http_code` propagado (403 × 401) e **sessão órfã** em `auth.sessions`? | passo S1 (antes/depois) | _preencher_ |
| Q4 | Hook disponível no plano/projeto usado | passo 0 | _preencher_ |
| Q7 | Tempo limite do hook Postgres | observação | _preencher_ |

## Provas da regra de produto

| Cenário | Asserções | Resultado |
|---|---|---|
| **S1** A ativo → B recusado → A continua válido | S1.a–S1.g (login A, A única viva, B sem token para 403 e 401, **sem sessão órfã**, A viva, A faz refresh, A aceito em `/user`) | _preencher_ |
| **S2** 31 dias de inatividade → B permitido | S2.a–S2.d (B permitido, B viva, A `INACTIVITY_EXPIRED`, refresh de A negado) | _preencher_ |
| **S3** Recovery → A invalidada, B autorizada | S3.a–S3.h (B recusado antes; B autorizado na janela; A `ACCOUNT_RECOVERY`; B única viva; refresh de A negado/de B permitido; janela de uso único) | _preencher_ |

## Decisões condicionadas ao resultado

- Se Q1 não confirmar `'password'`/`'token_refresh'`, reescrever o discriminador do hook (database §0003).
- Se Q3 mostrar sessão órfã, adicionar limpeza server-side (`sweep`) e rever a negação.
- Qualquer `FAIL` em S1–S3 **bloqueia a Fase 2**: o hook não atende a regra de produto.
- A revogação por hook marca `device_sessions`; invalidar de fato a sessão no Auth (refresh token) é passo server-side fora do hook (Edge Function) — S3.f mede se isso é necessário.
