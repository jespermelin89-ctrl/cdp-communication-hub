/**
 * SmtpService - Send email from custom domain accounts via SMTP.
 *
 * Handles outgoing mail for IMAP/SMTP accounts.
 * Uses nodemailer for SMTP transport.
 */

import nodemailer from 'nodemailer';
import { prisma } from '../config/database';
import { decrypt } from '../utils/encryption';

interface SmtpCredentials {
  host: string;
  port: number;
  useSsl: boolean;
  user: string;
  password: string;
  fromAddress: string;
  fromName?: string;
}

export class SmtpService {
  /**
   * Get SMTP credentials for an account (decrypting password)
   */
  private async getCredentials(accountId: string): Promise<SmtpCredentials> {
    const account = await prisma.emailAccount.findUniqueOrThrow({
      where: { id: accountId },
    });

    if (account.provider !== 'imap') {
      throw new Error(`Account ${accountId} is not an IMAP/SMTP account`);
    }

    if (!account.smtpHost || !account.smtpPort || !account.imapPasswordEncrypted) {
      throw new Error('SMTP account is missing host, port, or password configuration');
    }

    return {
      host: account.smtpHost,
      port: account.smtpPort,
      useSsl: account.smtpUseSsl,
      user: account.emailAddress,
      password: decrypt(account.imapPasswordEncrypted), // Same password for IMAP and SMTP
      fromAddress: account.emailAddress,
      fromName: account.displayName || undefined,
    };
  }

  /**
   * Create an SMTP transporter
   */
  private async createTransport(credentials: SmtpCredentials) {
    return nodemailer.createTransport({
      host: credentials.host,
      port: credentials.port,
      secure: credentials.useSsl, // true for 465, false for 587 with STARTTLS
      auth: {
        user: credentials.user,
        pass: credentials.password,
      },
      tls: {
        // Allow self-signed certificates for some mail servers
        rejectUnauthorized: false,
      },
    });
  }

  /**
   * Send an email via SMTP.
   * This is ONLY called after a draft has been approved.
   */
  async sendEmail(
    accountId: string,
    options: {
      to: string[];
      cc?: string[];
      subject: string;
      body: string;
      inReplyTo?: string;
      references?: string;
    }
  ): Promise<{ messageId: string }> {
    const credentials = await this.getCredentials(accountId);
    const transport = await this.createTransport(credentials);

    const fromField = credentials.fromName
      ? `"${credentials.fromName}" <${credentials.fromAddress}>`
      : credentials.fromAddress;

    const mailOptions: any = {
      from: fromField,
      to: options.to.join(', '),
      subject: options.subject,
      text: options.body,
    };

    if (options.cc && options.cc.length > 0) {
      mailOptions.cc = options.cc.join(', ');
    }

    // Thread reply headers
    if (options.inReplyTo) {
      mailOptions.inReplyTo = options.inReplyTo;
    }
    if (options.references) {
      mailOptions.references = options.references;
    }

    const result = await transport.sendMail(mailOptions);

    return {
      messageId: result.messageId || '',
    };
  }

  /**
   * Test SMTP connection (used when adding a new account)
   */
  async testConnection(credentials: {
    host: string;
    port: number;
    useSsl: boolean;
    user: string;
    password: string;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const transport = nodemailer.createTransport({
        host: credentials.host,
        port: credentials.port,
        secure: credentials.useSsl,
        auth: {
          user: credentials.user,
          pass: credentials.password,
        },
        tls: { rejectUnauthorized: false },
      });

      await transport.verify();
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}

// Singleton
export const smtpService = new SmtpService();
