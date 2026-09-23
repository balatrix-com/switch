import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type CredentialEmailStatus = 'SENT' | 'FAILED' | 'SKIPPED';

export interface CredentialEmailResult {
  status: CredentialEmailStatus;
}

export interface UserCredentialsEmail {
  email: string;
  password: string;
  name?: string | null;
  role: 'CUSTOMER' | 'SUPPORT_MEMBER';
}

@Injectable()
export class ZeptoMailService {
  private readonly logger = new Logger(ZeptoMailService.name);

  constructor(private readonly config: ConfigService) {}

  async sendUserCredentials(
    credentials: UserCredentialsEmail,
  ): Promise<CredentialEmailResult> {
    if (!this.enabled()) {
      this.logger.debug(
        `Credential email skipped for ${credentials.email}: ZeptoMail is disabled`,
      );
      return { status: 'SKIPPED' };
    }

    const token = this.config
      .get<string>('ZEPTOMAIL_SEND_MAIL_TOKEN')
      ?.trim();
    const fromAddress = this.config
      .get<string>('ZEPTOMAIL_FROM_ADDRESS')
      ?.trim();

    if (!token || !fromAddress) {
      this.logger.error(
        'Credential email was not sent because ZEPTOMAIL_SEND_MAIL_TOKEN or ZEPTOMAIL_FROM_ADDRESS is missing',
      );
      return { status: 'FAILED' };
    }

    const endpoint =
      this.config
        .get<string>('ZEPTOMAIL_API_URL')
        ?.trim() || 'https://api.zeptomail.com/v1.1/email';
    const fromName =
      this.config.get<string>('ZEPTOMAIL_FROM_NAME')?.trim() || 'Switchboard';
    const loginUrl =
      this.config.get<string>('PORTAL_LOGIN_URL')?.trim() ||
      'https://switchboard.local/login';
    const timeoutMs = this.timeoutMs();
    const roleName =
      credentials.role === 'SUPPORT_MEMBER'
        ? 'Support Member'
        : 'Customer Administrator';
    const displayName = credentials.name?.trim() || roleName;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: token.startsWith('Zoho-enczapikey ')
            ? token
            : `Zoho-enczapikey ${token}`,
        },
        body: JSON.stringify({
          from: { address: fromAddress, name: fromName },
          to: [
            {
              email_address: {
                address: credentials.email,
                name: displayName,
              },
            },
          ],
          subject: 'Your Switchboard login credentials',
          textbody: this.textBody(
            displayName,
            roleName,
            credentials.email,
            credentials.password,
            loginUrl,
          ),
          htmlbody: this.htmlBody(
            displayName,
            roleName,
            credentials.email,
            credentials.password,
            loginUrl,
          ),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const detail = (await response.text()).slice(0, 500);
        this.logger.error(
          `ZeptoMail rejected credential email for ${credentials.email}: HTTP ${response.status}${detail ? ` ${detail}` : ''}`,
        );
        return { status: 'FAILED' };
      }

      this.logger.log(`Credential email sent to ${credentials.email}`);
      return { status: 'SENT' };
    } catch (error) {
      const reason =
        error instanceof Error && error.name === 'AbortError'
          ? `request timed out after ${timeoutMs}ms`
          : error instanceof Error
            ? error.message
            : 'unknown error';
      this.logger.error(
        `Failed to send credential email to ${credentials.email}: ${reason}`,
      );
      return { status: 'FAILED' };
    } finally {
      clearTimeout(timeout);
    }
  }

  private enabled(): boolean {
    return (
      this.config.get<string>('ZEPTOMAIL_ENABLED', 'false').toLowerCase() ===
      'true'
    );
  }

  private timeoutMs(): number {
    const configured = Number(
      this.config.get<string>('ZEPTOMAIL_TIMEOUT_MS', '10000'),
    );
    return Number.isFinite(configured) && configured >= 1000
      ? Math.min(configured, 30000)
      : 10000;
  }

  private textBody(
    name: string,
    role: string,
    email: string,
    password: string,
    loginUrl: string,
  ): string {
    return [
      `Hello ${name},`,
      '',
      `Your ${role} account has been created.`,
      '',
      `Login URL: ${loginUrl}`,
      `Email: ${email}`,
      `Temporary password: ${password}`,
      '',
      'For security, sign in and change your password immediately.',
      'If you were not expecting this account, contact your administrator.',
    ].join('\n');
  }

  private htmlBody(
    name: string,
    role: string,
    email: string,
    password: string,
    loginUrl: string,
  ): string {
    const safeName = this.escapeHtml(name);
    const safeRole = this.escapeHtml(role);
    const safeEmail = this.escapeHtml(email);
    const safePassword = this.escapeHtml(password);
    const safeLoginUrl = this.escapeHtml(loginUrl);
    return `<!doctype html>
<html><body style="font-family:Arial,sans-serif;color:#172033;line-height:1.5">
  <h2>Your Switchboard account is ready</h2>
  <p>Hello ${safeName},</p>
  <p>Your ${safeRole} account has been created.</p>
  <table style="border-collapse:collapse">
    <tr><td style="padding:6px 12px 6px 0"><strong>Login URL</strong></td><td><a href="${safeLoginUrl}">${safeLoginUrl}</a></td></tr>
    <tr><td style="padding:6px 12px 6px 0"><strong>Email</strong></td><td>${safeEmail}</td></tr>
    <tr><td style="padding:6px 12px 6px 0"><strong>Temporary password</strong></td><td><code>${safePassword}</code></td></tr>
  </table>
  <p><strong>For security, sign in and change your password immediately.</strong></p>
  <p>If you were not expecting this account, contact your administrator.</p>
</body></html>`;
  }

  private escapeHtml(value: string): string {
    return value.replace(
      /[&<>"']/g,
      (character) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[character]!,
    );
  }
}
