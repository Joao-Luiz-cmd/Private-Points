// Interface de e-mail para as Edge Functions (D25). Provedor escolhido por configuração (MAIL_PROVIDER).
// STATUS: NÃO VERIFICADO (sem Deno/Supabase neste ambiente). Nenhum provedor, domínio ou segredo hardcoded.
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/** Desenvolvimento: NÃO envia; registra só metadados (nunca o corpo: pode conter link/token). */
export class LogMailer implements Mailer {
  send(message: MailMessage): Promise<void> {
    console.log(JSON.stringify({ mailer: 'log', subject: message.subject, to_domain: message.to.split('@')[1] ?? '' }));
    return Promise.resolve();
  }
}

export type MailProvider = 'log';

/** Novos provedores (SMTP/HTTP API) entram aqui como adaptadores, sem mudar as funções chamadoras. */
export function createMailer(env: { get(key: string): string | undefined }): Mailer {
  const provider = env.get('MAIL_PROVIDER') ?? 'log';
  switch (provider) {
    case 'log':
      return new LogMailer();
    default:
      throw new Error(`MAIL_PROVIDER "${provider}" não está configurado nesta versão`);
  }
}
