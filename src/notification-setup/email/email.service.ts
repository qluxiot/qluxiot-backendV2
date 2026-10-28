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

  /**
   * Send notification when an operator/client assigns a schedule to devices.
   */
  async sendScheduleAssignmentEmail(data: {
    moduleName: 'Smart LED Streetlight' | 'Smart Solar Streetlight';
    assignedByName: string;
    assignedAt: Date;
    scheduleName: string;
    scheduleRules: any[];
    devices: { serial: string; name?: string; projectName?: string }[];
  }): Promise<void> {
    const targetEmail = 'iqbal@qluxgroup.com';
    const dateFormatted = data.assignedAt.toLocaleString('en-MY', {
      timeZone: 'Asia/Kuala_Lumpur',
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    let rulesHtml = '<p style="color: #64748b; font-style: italic; margin: 4px 0;">No specific rules defined or schedule cleared.</p>';
    if (data.scheduleRules && data.scheduleRules.length > 0) {
      if (data.moduleName === 'Smart Solar Streetlight') {
        const items = data.scheduleRules.map((r, i) =>
          `<li style="margin-bottom: 4px;"><strong>Phase ${i + 1}:</strong> <span style="color: #d97706; font-weight: 600;">${r.hours} hr(s)</span> at <span style="color: #16a34a; font-weight: 600;">${r.brightness}%</span></li>`
        ).join('');
        rulesHtml = `<ul style="margin: 6px 0; padding-left: 20px; color: #1e293b;">${items}</ul>`;
      } else {
        const items = data.scheduleRules.map(r =>
          `<li style="margin-bottom: 4px;"><strong>${r.time}</strong> &rarr; <span style="font-weight: 600; color: ${r.action === 'ON' ? '#16a34a' : (r.action === 'OFF' ? '#dc2626' : '#d97706')}">${r.action} (${r.brightness ?? (r.action === 'OFF' ? 0 : 100)}%)</span></li>`
        ).join('');
        rulesHtml = `<ul style="margin: 6px 0; padding-left: 20px; color: #1e293b;">${items}</ul>`;
      }
    }

    const deviceRows = data.devices.map((d, index) => `
      <tr style="border-bottom: 1px solid #e2e8f0; font-size: 13px;">
        <td style="padding: 8px 12px; color: #475569;">${index + 1}</td>
        <td style="padding: 8px 12px; font-weight: 600; color: #0f172a;">${d.name || '-'}</td>
        <td style="padding: 8px 12px; font-family: monospace; color: #2563eb;">${d.serial}</td>
        <td style="padding: 8px 12px; color: #475569;">${d.projectName || 'Unassigned'}</td>
      </tr>
    `).join('');

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 650px; margin: 0 auto; padding: 24px; background: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0;">
        <div style="background: #1e293b; color: white; padding: 18px 24px; border-radius: 8px 8px 0 0; margin: -24px -24px 20px -24px;">
          <h2 style="margin: 0; font-size: 18px; font-weight: 700;">🗓️ Schedule Assignment Notification</h2>
          <p style="margin: 4px 0 0 0; font-size: 13px; color: #94a3b8;">${data.moduleName} System</p>
        </div>

        <div style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 20px;">
          <h3 style="margin-top: 0; margin-bottom: 14px; font-size: 15px; color: #0f172a; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px;">Audit Details</h3>
          <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
            <tr>
              <td style="padding: 4px 0; color: #64748b; width: 140px;">Applied By:</td>
              <td style="padding: 4px 0; font-weight: 600; color: #0f172a;">${data.assignedByName}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #64748b;">Applied At:</td>
              <td style="padding: 4px 0; color: #0f172a;">${dateFormatted} (MYT)</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #64748b;">Schedule Profile:</td>
              <td style="padding: 4px 0; font-weight: 700; color: #2563eb;">${data.scheduleName}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #64748b; vertical-align: top;">Profile Rules:</td>
              <td style="padding: 4px 0;">${rulesHtml}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #64748b;">Total Devices:</td>
              <td style="padding: 4px 0; font-weight: 700; color: #0f172a;">${data.devices.length} device(s)</td>
            </tr>
          </table>
        </div>

        <div style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0;">
          <h3 style="margin-top: 0; margin-bottom: 14px; font-size: 15px; color: #0f172a; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px;">Assigned Devices List</h3>
          <div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; text-align: left;">
              <thead>
                <tr style="background: #f1f5f9; font-size: 12px; text-transform: uppercase; color: #475569;">
                  <th style="padding: 8px 12px; width: 30px;">#</th>
                  <th style="padding: 8px 12px;">Device Name</th>
                  <th style="padding: 8px 12px;">Serial No</th>
                  <th style="padding: 8px 12px;">Project</th>
                </tr>
              </thead>
              <tbody>
                ${deviceRows}
              </tbody>
            </table>
          </div>
        </div>

        <p style="color: #94a3b8; font-size: 12px; margin-top: 20px; text-align: center;">
          Qlux IoT Cloud Notification &bull; Delivered automatically to iqbal@qluxgroup.com
        </p>
      </div>
    `;

    try {
      await this.sendEmail(
        targetEmail,
        `[Qlux IoT] Schedule Assigned: "${data.scheduleName}" (${data.devices.length} devices) by ${data.assignedByName}`,
        html,
        'Qlux IoT Schedule Monitor'
      );
      this.logger.log(`✅ Schedule assignment notification email sent to ${targetEmail}`);
    } catch (error) {
      this.logger.error(`❌ Failed to send schedule assignment email: ${error.message}`);
    }
  }
}
