import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private brevoApiKey?: string;

  constructor(private readonly config: ConfigService) {
    this.brevoApiKey = this.config.get<string>('BREVO_API_KEY');

    const port = Number(this.config.get('EMAIL_PORT')) || 587;
    const emailHost = this.config.get<string>('EMAIL_HOST');

    if (emailHost) {
      this.transporter = nodemailer.createTransport({
        host: emailHost,
        port: port,
        secure: port === 465,
        auth: {
          user: this.config.get<string>('EMAIL_USER'),
          pass: this.config.get<string>('EMAIL_PASS'),
        },
        connectionTimeout: 20000,
        greetingTimeout: 15000,
        socketTimeout: 30000,
      });
    }
  }

  private async sendEmail(to: string, subject: string, html: string, senderName = 'Qlux IoT'): Promise<void> {
    const from = this.config.get<string>('EMAIL_FROM') || 'qluxiot@gmail.com';

    // 1. If BREVO_API_KEY is configured, use Brevo REST API (works across firewalls / Render free tier)
    if (this.brevoApiKey) {
      this.logger.log(`Sending email to ${to} via Brevo REST API...`);
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'api-key': this.brevoApiKey,
        },
        body: JSON.stringify({
          sender: { name: senderName, email: from },
          to: [{ email: to }],
          subject,
          htmlContent: html,
        }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Brevo API Error (${response.status}): ${errorData}`);
      }
      return;
    }

    // 2. Fallback to standard SMTP / Nodemailer
    if (this.transporter) {
      this.logger.log(`Sending email to ${to} via SMTP...`);
      await this.transporter.sendMail({
        from: `"${senderName}" <${from}>`,
        to,
        subject,
        html,
      });
      return;
    }

    throw new Error('No email transport configured (missing BREVO_API_KEY or EMAIL_HOST).');
  }

  /**
   * Send a verification link to a newly registered email channel.
   */
  async sendVerificationEmail(to: string, channelName: string, verifyUrl: string): Promise<void> {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px; background: #f9fafb; border-radius: 12px;">
        <h2 style="color: #0f172a; margin-bottom: 8px;">Verify Your Notification Channel</h2>
        <p style="color: #475569; margin-bottom: 24px;">
          Hi! You registered <strong>${channelName}</strong> as an Email notification channel on the Qlux IoT System.<br/>
          Click the button below to verify your email address and start receiving alerts.
        </p>
        <a href="${verifyUrl}"
           style="display: inline-block; background: #3b82f6; color: white; padding: 12px 28px;
                  border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
          ✅ Verify Email
        </a>
        <p style="color: #94a3b8; margin-top: 24px; font-size: 13px;">
          If you did not register this channel, you can safely ignore this email.<br/>
          This link will not expire unless you delete the channel.
        </p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;"/>
        <p style="color: #cbd5e1; font-size: 12px;">Qlux IoT System — Automated Notification</p>
      </div>
    `;

    try {
      await this.sendEmail(to, 'Verify Your Qlux Notification Channel', html, 'Qlux IoT');
      this.logger.log(`✅ Verification email sent to ${to}`);
    } catch (error) {
      this.logger.error(`❌ Failed to send verification email to ${to}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Send an alarm notification email when an alarm is triggered.
   */
  async sendAlarmEmail(to: string, subject: string, body: string): Promise<void> {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px;
                  background: #fef2f2; border-radius: 12px; border: 1px solid #fecaca;">
        <h2 style="color: #991b1b; margin-bottom: 8px;">⚠️ Qlux IoT Alert</h2>
        <p style="color: #374151; font-size: 16px; line-height: 1.6;">${body}</p>
        <hr style="border: none; border-top: 1px solid #fecaca; margin: 24px 0;"/>
        <p style="color: #94a3b8; font-size: 13px;">
          This is an automated alert from your Qlux IoT System.
        </p>
      </div>
    `;

    try {
      await this.sendEmail(to, subject, html, 'Qlux IoT Alerts');
      this.logger.log(`✅ Alarm email sent to ${to}`);
    } catch (error) {
      this.logger.error(`❌ Failed to send alarm email to ${to}: ${error.message}`);
      throw error;
    }
  }
}
