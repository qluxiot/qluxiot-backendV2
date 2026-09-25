import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Between } from 'typeorm';
import { Alarm } from '../entities/alarm.entity';
import { NotificationChannel } from '../../notification-setup/entities/notification-channel.entity';
import { WhatsappService } from '../../notification-setup/whatsapp/whatsapp.service';
import { EmailService } from '../../notification-setup/email/email.service';
import { EntityManager } from 'typeorm';

@Injectable()
export class AlarmsService {
  private readonly logger = new Logger(AlarmsService.name);

  constructor(
    @InjectRepository(Alarm)
    private readonly alarmRepo: Repository<Alarm>,
    @InjectRepository(NotificationChannel)
    private readonly channelRepo: Repository<NotificationChannel>,
    private readonly whatsappService: WhatsappService,
    private readonly emailService: EmailService,
    private readonly entityManager: EntityManager,
  ) { }

  async findAll(page: number = 1, pageSize: number = 10, deviceType?: string, projectId?: number | null) {
    const skip = (page - 1) * pageSize;

    const whereClause: any = {};
    if (deviceType) {
      whereClause.device_type = deviceType;
    }
    // If a projectId is provided (including null for global), strictly filter by it
    if (projectId !== undefined) {
      whereClause.project_id = projectId;
    }

    const [list, totalRow] = await this.alarmRepo.findAndCount({
      where: whereClause,
      order: { date: 'DESC', time: 'DESC' },
      skip,
      take: pageSize,
    });

    const totalPage = Math.ceil(totalRow / pageSize);

    // Fetch coordinates for each alarm
    for (const alarm of list) {
      let loc: any[] = [];
      if (alarm.device_type === 'solar') {
        loc = await this.entityManager.query(`SELECT latitude, longitude FROM solar_devices WHERE serial = $1`, [alarm.serial]);
      } else if (alarm.device_type === 'led') {
        loc = await this.entityManager.query(`SELECT latitude, longitude FROM led_devices WHERE serial = $1`, [alarm.serial]);
      }

      if (loc && loc.length > 0) {
        (alarm as any).latitude = loc[0].latitude;
        (alarm as any).longitude = loc[0].longitude;
      }
    }

    return {
      msg: 'success',
      code: 10000,
      data: {
        totalRow,
        pageNumber: page,
        firstPage: page === 1,
        lastPage: page >= totalPage,
        totalPage,
        pageSize,
        list,
      },
    };
  }

  async countAlarms(projectId?: number, deviceType?: string, startDate?: string, endDate?: string): Promise<number> {
    const whereClause: any = {};
    if (projectId) whereClause.project_id = projectId;
    if (deviceType) whereClause.device_type = deviceType;
    if (startDate && endDate) {
      whereClause.date = Between(startDate, endDate);
    }
    return this.alarmRepo.count({ where: whereClause });
  }

  async handleAlarm(id: number) {
    const alarm = await this.alarmRepo.findOne({ where: { id } });
    if (!alarm) {
      throw new Error(`Alarm with ID ${id} not found`);
    }
    alarm.is_handle = 1;
    await this.alarmRepo.save(alarm);
    return alarm;
  }

  async triggerAlarm(data: {
    serial: string;
    name: string;
    device_type: string;
    warning_information: string;
    english: string;
    project_id?: number | null;
    skipDispatch?: boolean; // Set true when using batch dispatch (cron jobs) to prevent per-device spam
  }) {
    // ── Deduplication: Prevent duplicate active alarms for the same issue ──
    const existing = await this.alarmRepo.findOne({
      where: {
        serial: data.serial,
        english: data.english,
        is_handle: 0,
      },
    });

    if (existing) {
      return null; // Already triggered and unhandled — do NOT re-notify (return null so cron ignores it)
    }

    // ── Save the new alarm to the database ──
    const nowLocal = new Date().toLocaleString('en-CA', { timeZone: 'Asia/Kuala_Lumpur', hour12: false });
    // 'en-CA' format is YYYY-MM-DD, HH:mm:ss p.m.
    // So we can extract it reliably
    const [datePart, timePart] = nowLocal.split(', ');
    const dateStr = datePart; // YYYY-MM-DD
    const timeStr = timePart.trim(); // HH:mm:ss

    const alarm = this.alarmRepo.create({
      serial: data.serial,
      name: data.name,
      device_type: data.device_type,
      warning_information: data.warning_information,
      english: data.english,
      is_handle: 0,
      date: dateStr,
      time: timeStr,
      project_id: data.project_id ?? null,
    });

    await this.alarmRepo.save(alarm);
    this.logger.warn(`ALARM TRIGGERED: [${data.serial}] ${data.english} (${data.warning_information})`);

    // ── Dispatch immediately only if NOT using batch mode ──
    // Cron jobs set skipDispatch: true and call dispatchBatchSummary() at the end of the cycle.
    if (!data.skipDispatch) {
      this.dispatchNotifications(data).catch(err =>
        this.logger.error(`Failed to dispatch notifications for alarm [${data.serial}]: ${err.message}`)
      );
    }

    return alarm;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Batch Summary Dispatcher
  //
  // Called at the END of a cron cycle with all newly created alarm IDs.
  // Groups alarms by project + alarm type:
  //   ≤ 3 alarms → send individual notifications per device (full detail)
  //   ≥ 4 alarms → send ONE summary notification for the whole group
  //
  // This prevents "Alarm Storms" when 100+ devices fail at the same time.
  // ─────────────────────────────────────────────────────────────────────────────
  async dispatchBatchSummary(alarmIds: number[]): Promise<void> {
    if (!alarmIds || alarmIds.length === 0) return;

    const BATCH_THRESHOLD = 4; // ≥ this many alarms in a cycle = send summary instead

    // Fetch the actual alarm records
    const alarms = await this.alarmRepo.findBy({ id: In(alarmIds) });
    if (alarms.length === 0) return;

    // Group by project_id + english (alarm type)
    const groups = new Map<string, typeof alarms>();
    for (const alarm of alarms) {
      const key = `${alarm.project_id ?? 'global'}::${alarm.english}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(alarm);
    }

    for (const [, groupAlarms] of groups) {
      const sample = groupAlarms[0];
      const projectId = sample.project_id ?? null;

      if (groupAlarms.length < BATCH_THRESHOLD) {
        // ── Individual notifications (≤ 3 devices) ──
        for (const alarm of groupAlarms) {
          this.dispatchNotifications({
            serial: alarm.serial,
            name: alarm.name,
            device_type: alarm.device_type,
            english: alarm.english,
            warning_information: alarm.warning_information,
            project_id: projectId,
          }).catch(err =>
            this.logger.error(`[BATCH] Failed individual notify for ${alarm.serial}: ${err.message}`)
          );
        }
      } else {
        // ── Single summary notification (≥ 4 devices) ──
        const channels = await this.channelRepo.find({ where: { is_active: true, is_verified: true } });
        const targetChannels = channels.filter(ch => ch.project_id === projectId);

        if (targetChannels.length === 0) {
          this.logger.warn(`[BATCH] No channels for project_id=${projectId ?? 'global'} — skipping summary.`);
          continue;
        }

        const deviceTypeLabel = sample.device_type === 'solar' ? '☀️ Smart Solar' : '💡 Smart LED Streetlight';
        const alarmTime = new Date().toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' });
        const count = groupAlarms.length;
        const deviceList = groupAlarms.slice(0, 5).map(a => `${a.name} (${a.serial})`).join(', ');
        const remaining = count > 5 ? ` ... and ${count - 5} more` : '';

        const whatsappMessage =
          `🚨 *QLUX IoT — MASS ALARM*\n\n` +
          `⚠️ *${count} devices triggered:* ${sample.english}\n` +
          `🔧 *Module:* ${deviceTypeLabel}\n` +
          `🕐 *Time:* ${alarmTime}\n\n` +
          `📍 *Affected Devices:*\n${deviceList}${remaining}\n\n` +
          `_This may indicate a widespread power outage or gateway failure. Please log in to the Qlux IoT dashboard immediately to investigate._`;

        const emailSubject = `⚠️ Qlux IoT — Mass Alarm: ${count} devices triggered "${sample.english}"`;
        const emailBody =
          `<b>${count} devices triggered: ${sample.english}</b><br/>` +
          `<b>Module:</b> ${deviceTypeLabel}<br/>` +
          `<b>Time:</b> ${alarmTime}<br/><br/>` +
          `<b>Affected Devices:</b><br/>${deviceList}${remaining}<br/><br/>` +
          `This may indicate a widespread power outage or gateway failure.<br/>` +
          `Please log in to the <b>Qlux IoT dashboard</b> immediately to investigate.`;

        for (const channel of targetChannels) {
          try {
            if (channel.channel_type === 'whatsapp') {
              await this.whatsappService.sendMessage(channel.channel_address, whatsappMessage);
              this.logger.log(`[BATCH] ✅ Summary WhatsApp sent to ${channel.channel_address}`);
            } else if (channel.channel_type === 'email') {
              await this.emailService.sendAlarmEmail(channel.channel_address, emailSubject, emailBody);
              this.logger.log(`[BATCH] ✅ Summary Email sent to ${channel.channel_address}`);
            }
          } catch (err) {
            this.logger.error(`[BATCH] ❌ Failed to send summary to ${channel.channel_address}: ${err.message}`);
          }
        }

        this.logger.warn(`[BATCH] Sent mass alarm summary for ${count} devices — type: "${sample.english}" — project: ${projectId ?? 'global'}`);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Notification Dispatcher: Finds all verified, active channels for the device's
  // project (or global channels if no project) and sends one-shot WhatsApp/Email alerts.
  // ─────────────────────────────────────────────────────────────────────────────
  private async dispatchNotifications(data: {
    serial: string;
    name: string;
    device_type: string;
    english: string;
    warning_information: string;
    project_id?: number | null;
  }) {
    // Fetch channels: match on same project_id, OR global channels (project_id IS NULL)
    const channels = await this.channelRepo.find({
      where: { is_active: true, is_verified: true },
    });

    // Filter by project: strictly include channels belonging to the exact same project as the device.
    // If the device has no project (global), it will only notify global channels.
    const targetChannels = channels.filter(ch => ch.project_id === (data.project_id ?? null));

    if (targetChannels.length === 0) {
      this.logger.warn(`[ALARM NOTIFY] No active verified channels found for project_id=${data.project_id ?? 'global'} — skipping notification.`);
      return;
    }

    // Fetch location
    let loc: any[] = [];
    if (data.device_type === 'solar') {
      loc = await this.entityManager.query(`SELECT latitude, longitude FROM solar_devices WHERE serial = $1`, [data.serial]);
    } else if (data.device_type === 'led') {
      loc = await this.entityManager.query(`SELECT latitude, longitude FROM led_devices WHERE serial = $1`, [data.serial]);
    }
    
    let mapLink = 'Unknown';
    if (loc && loc.length > 0 && loc[0].latitude !== undefined && loc[0].longitude !== undefined) {
      const lat = Number(loc[0].latitude);
      const lng = Number(loc[0].longitude);
      if (!isNaN(lat) && !isNaN(lng) && (lat !== 0 || lng !== 0)) {
        mapLink = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
      }
    }

    const deviceTypeLabel = data.device_type === 'solar' ? '☀️ Smart Solar' : '💡 Smart LED Streetlight';
    const alarmTime = new Date().toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' });

    const whatsappMessage =
      `🚨 *QLUX IoT ALARM*\n\n` +
      `📍 *Device:* ${data.name} (${data.serial})\n` +
      `🔧 *Module:* ${deviceTypeLabel}\n` +
      `⚠️ *Issue:* ${data.english}\n` +
      `🕐 *Time:* ${alarmTime}\n` +
      `🗺️ *Location:* ${mapLink}\n\n` +
      `_Please log in to the Qlux IoT dashboard to view and resolve this alarm._`;

    const emailSubject = `⚠️ Qlux IoT Alarm — ${data.english} (${data.serial})`;
    const emailBody =
      `<b>Device:</b> ${data.name} (${data.serial})<br/>` +
      `<b>Module:</b> ${deviceTypeLabel}<br/>` +
      `<b>Issue:</b> ${data.english}<br/>` +
      `<b>Time:</b> ${alarmTime}<br/>` +
      `<b>Location:</b> ${mapLink !== 'Unknown' ? `<a href="${mapLink}">View on Google Maps</a>` : 'Unknown'}<br/><br/>` +
      `Please log in to the <b>Qlux IoT dashboard</b> to view and resolve this alarm.`;

    for (const channel of targetChannels) {
      try {
        if (channel.channel_type === 'whatsapp') {
          await this.whatsappService.sendMessage(channel.channel_address, whatsappMessage);
          this.logger.log(`[ALARM NOTIFY] ✅ WhatsApp sent to ${channel.channel_address} (${channel.name})`);
        } else if (channel.channel_type === 'email') {
          await this.emailService.sendAlarmEmail(channel.channel_address, emailSubject, emailBody);
          this.logger.log(`[ALARM NOTIFY] ✅ Email sent to ${channel.channel_address} (${channel.name})`);
        }
      } catch (err) {
        this.logger.error(`[ALARM NOTIFY] ❌ Failed to notify ${channel.channel_address}: ${err.message}`);
      }
    }
  }
}
