import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LedDevicesService } from './led-devices.service';
import { LedTelemetryHistoryService } from './led-telemetry-history.service';
import { AlarmsService } from '../../alarms/services/alarms.service';
import { LedDevice } from '../entities/led-device.entity';

@Injectable()
export class LedCronService {
  private readonly logger = new Logger(LedCronService.name);

  constructor(
    private readonly ledDevicesService: LedDevicesService,
    private readonly historyService: LedTelemetryHistoryService,
    private readonly alarmsService: AlarmsService,
  ) { }

  // ─────────────────────────────────────────────────────────────────────────────
  // Helper: Get current Malaysia time (UTC+8) regardless of server timezone.
  // Works identically on localhost (Windows) and Render (UTC Linux).
  // ─────────────────────────────────────────────────────────────────────────────
  private getMalaysiaTime(): { hour: number; minute: number } {
    const nowUtcMs = Date.now();
    const myt_offset_ms = 8 * 60 * 60 * 1000; // UTC+8
    const myTime = new Date(nowUtcMs + myt_offset_ms);
    return { hour: myTime.getUTCHours(), minute: myTime.getUTCMinutes() };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Helper: Parse schedule profile rules and determine if the light should
  // currently be ON based on Malaysia time (UTC+8).
  //
  // Rules format example:
  //   [{ time: '19:00', action: 'ON', brightness: 100 },
  //    { time: '00:00', action: 'DIM', brightness: 50 },
  //    { time: '06:00', action: 'OFF' }]
  //
  // Logic: find the last rule whose time <= current time (wrapping around midnight)
  // ─────────────────────────────────────────────────────────────────────────────
  private getScheduleState(rules: any[]): { isOn: boolean, minutesSinceActive: number } {
    if (!rules || rules.length === 0) return { isOn: false, minutesSinceActive: 0 };

    const { hour, minute } = this.getMalaysiaTime();
    const nowMinutes = hour * 60 + minute;

    const sortedRules = rules
      .filter(r => r.time && r.action)
      .map(r => {
        const [h, m] = r.time.split(':').map(Number);
        return { totalMinutes: h * 60 + m, action: r.action as string };
      })
      .sort((a, b) => a.totalMinutes - b.totalMinutes);

    if (sortedRules.length === 0) return { isOn: false, minutesSinceActive: 0 };

    let activeRule: { totalMinutes: number; action: string } | null = null;
    let minutesSinceActive = 0;

    for (const rule of sortedRules) {
      if (rule.totalMinutes <= nowMinutes) {
        activeRule = rule;
        minutesSinceActive = nowMinutes - rule.totalMinutes;
      }
    }

    if (!activeRule) {
      activeRule = sortedRules[sortedRules.length - 1];
      minutesSinceActive = (nowMinutes + 1440) - activeRule.totalMinutes;
    }

    const isOn = activeRule.action === 'ON' || activeRule.action === 'DIM';
    return { isOn, minutesSinceActive };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Alarm Evaluator: Called per device after each telemetry sync
  //
  // Alarm 1 — OFFLINE DURING WORKING HOURS:
  //   The device is supposed to be ON (per schedule) but is_online = 0.
  //
  // Alarm 2 — LAMP FAILURE:
  //   The device is online and supposed to be ON, but is_lighting = 0.
  //   This means the hardware reports it is connected but the lamp is NOT lit,
  //   which indicates a physical lamp or driver failure.
  // ─────────────────────────────────────────────────────────────────────────────
  private async evaluateAlarms(device: LedDevice): Promise<number[]> {
    const projectId = device.project?.id ?? null;
    const newAlarmIds: number[] = [];
    const isGateway = device.device_type?.toLowerCase() === 'gateway' || (device.name && device.name.toLowerCase().includes('gateway'));

    if (isGateway) {
      if (device.is_online === 0) {
        const alarm = await this.alarmsService.triggerAlarm({
          serial: device.serial,
          name: device.name,
          device_type: 'led',
          warning_information: '网关离线',
          english: 'Gateway Offline',
          project_id: projectId,
          skipDispatch: true,
        });
        if (alarm) newAlarmIds.push(alarm.id);
        this.logger.warn(`[LED ALARM] ${device.serial} — Gateway offline`);
      }
      return newAlarmIds; // Gateways do not have lamps or schedules
    }

    const rules = device.schedule_profile?.rules;
    const scheduleState = this.getScheduleState(rules);

    if (scheduleState.isOn) {
      // Alarm 1: Offline during working hours
      if (device.is_online === 0) {
        const alarm = await this.alarmsService.triggerAlarm({
          serial: device.serial,
          name: device.name,
          device_type: 'led',
          warning_information: '工作时间内设备离线',
          english: 'Offline During Working Hours',
          project_id: projectId,
          skipDispatch: true,
        });
        if (alarm) newAlarmIds.push(alarm.id);
        this.logger.warn(`[LED ALARM] ${device.serial} — Offline during working hours`);
      } else if (device.is_lighting === 0 && scheduleState.minutesSinceActive >= 15) {
        // Alarm 2: Lamp failure (device online, should be ON, but lamp is not lighting)
        // With a 15-minute grace period to allow the hardware to warm up and sync.
        const alarm = await this.alarmsService.triggerAlarm({
          serial: device.serial,
          name: device.name,
          device_type: 'led',
          warning_information: '灯具故障 (在线但未亮)',
          english: 'Lamp Failure (Online But Not Lighting)',
          project_id: projectId,
          skipDispatch: true,
        });
        if (alarm) newAlarmIds.push(alarm.id);
        this.logger.warn(`[LED ALARM] ${device.serial} — Lamp failure (online but not lighting for >= 15m)`);
      }
    }

    // ── Alarm 3: Abnormal Power Surge ────────────────────────────────────────
    // Runs regardless of schedule (24/7) — a surge is dangerous at any hour.
    // Only fires if device is online to avoid false alarms from stale null data.
    const POWER_SURGE_THRESHOLD_W = 250;
    if (device.is_online === 1 && Number(device.active_power) > POWER_SURGE_THRESHOLD_W) {
      const alarm = await this.alarmsService.triggerAlarm({
        serial: device.serial,
        name: device.name,
        device_type: 'led',
        warning_information: `功率异常过载 (${device.active_power}W)`,
        english: 'Abnormal Power Surge Detected',
        project_id: projectId,
        skipDispatch: true,
      });
      if (alarm) newAlarmIds.push(alarm.id);
      this.logger.warn(`[LED ALARM] ${device.serial} — Power surge: ${device.active_power}W (threshold: ${POWER_SURGE_THRESHOLD_W}W)`);
    }

    return newAlarmIds;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Main Cron: Runs every 30 minutes — syncs telemetry and evaluates alarms
  // ─────────────────────────────────────────────────────────────────────────────
  @Cron(CronExpression.EVERY_30_MINUTES)
  async handleTelemetryLogging() {
    this.logger.log('[LED] Starting 30-minute LED telemetry logging cycle (Batch by Batch)...');
    const allNewAlarmIds: number[] = [];

    try {
      const devices = await this.ledDevicesService.findAll();

      const BATCH_SIZE = 5;
      for (let i = 0; i < devices.length; i += BATCH_SIZE) {
        const batch = devices.slice(i, i + BATCH_SIZE);
        this.logger.log(`[LED] Processing LED batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(devices.length / BATCH_SIZE)}`);

        const batchResults = await Promise.all(batch.map(async (device) => {
          try {
            const updatedDevice = await this.ledDevicesService.syncDeviceTelemetry(device.serial);
            if (updatedDevice) {
              this.logger.log(`[LED] Synced telemetry for LED ${device.serial}`);
              // Attach schedule_profile from pre-loaded device (findAll loads it; syncDeviceTelemetry doesn't)
              // so evaluateAlarms can determine working hours correctly
              updatedDevice.schedule_profile = device.schedule_profile;
              return await this.evaluateAlarms(updatedDevice);
            }
          } catch (error) {
            this.logger.error(`Failed to log telemetry for LED ${device.serial}: ${error.message}`);
          }
          return [];
        }));

        // Flatten and collect all new alarm IDs from this batch
        batchResults.forEach(ids => allNewAlarmIds.push(...ids));

        if (i + BATCH_SIZE < devices.length) {
          this.logger.log('[LED] Waiting 2 seconds before processing the next LED batch...');
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    } catch (error) {
      this.logger.error('Failed to fetch LED devices for logging cycle', error.stack);
    }

    // ── Dispatch notifications (batched) at the end of the full cycle ──
    // This prevents alarm storms when many devices fail simultaneously.
    if (allNewAlarmIds.length > 0) {
      this.logger.log(`[LED] Dispatching batch summary for ${allNewAlarmIds.length} new alarm(s)...`);
      await this.alarmsService.dispatchBatchSummary(allNewAlarmIds);
    }

    this.logger.log('[LED] Finished LED telemetry logging cycle.');
  }

  // NOTE: LED schedule execution has been removed from here.
  // Schedules are now pushed directly to the LED controller hardware via the Nengjia
  // distributeParam API when assigned. The hardware uses its own internal clock to
  // execute the schedule autonomously, without backend polling.
}
