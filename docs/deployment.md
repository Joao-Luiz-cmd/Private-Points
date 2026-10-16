# Deployment (Fase 1 — base)

Ambientes: **local** (Supabase CLI + Docker), **staging** e **produção** (projetos Supabase distintos). Segredos por ambiente; nenhum segredo no repositório nem no app ([security.md](security.md) §10).

Builds: Expo Development Build (`expo run:android` / `expo run:ios`), nunca Expo Go. Perfis EAS e publicação entram na Fase 10.
Pendências operacionais (não bloqueiam): provedor SMTP, domínio próprio (links + página do Turnstile), plano do Supabase em produção.
