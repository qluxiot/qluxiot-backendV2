import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private readonly config: ConfigService) {
    const port = this.config.get<number>('EMAIL_PORT');
    this.transporter = nodemailer.createTransport({
      host: this.config.get<string>('EMAIL_HOST'),
      port: port,
      secure: port == 465, // Use true for 465, false for 587 (STARTTLS)
      auth: {
        user: this.config.get<string>('EMAIL_USER'),
        pass: this.config.get<string>('EMAIL_PASS'),
      },
    });
  }

  /**
   * Send a verification link to a newly registered email channel.
   */
  async sendVerificationEmail(to: string, channelName: string, verifyUrl: string): Promise<void> {
    const from = this.config.get<string>('EMAIL_FROM');
    const mailOptions: nodemailer.SendMailOptions = {
      from: `"Qlux IoT" <${from}>`,
      to,
      subject: 'Verify Your Qlux Notification Channel',
      html: `
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
      `,
    };

    try {
      await this.transporter.sendMail(mailOptions);
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
    const from = this.config.get<string>('EMAIL_FROM');
    const mailOptions: nodemailer.SendMailOptions = {
      from: `"Qlux IoT Alerts" <${from}>`,
      to,
      subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px;
                    background: #fef2f2; border-radius: 12px; border: 1px solid #fecaca;">
          <h2 style="color: #991b1b; margin-bottom: 8px;">⚠️ Qlux IoT Alert</h2>
          <p style="color: #374151; font-size: 16px; line-height: 1.6;">${body}</p>
          <hr style="border: none; border-top: 1px solid #fecaca; margin: 24px 0;"/>
          <p style="color: #94a3b8; font-size: 13px;">
            This is an automated alert from your Qlux IoT System.
          </p>
        </div>
      `,
    };

    try {
      await this.transporter.sendMail(mailOptions);
      this.logger.log(`✅ Alarm email sent to ${to}`);
    } catch (error) {
      this.logger.error(`❌ Failed to send alarm email to ${to}: ${error.message}`);
      throw error;
    }
  }
}
