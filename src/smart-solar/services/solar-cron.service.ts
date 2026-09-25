import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SolarDevice } from '../entities/solar-device.entity';
import { TelemetryHistory } from '../entities/telemetry-history.entity';
import { SolarDailyStats } from '../entities/solar-daily-stats.entity';
import { NengjiaService } from '../../nengjia/nengjia.service';
import { AlarmsService } from '../../alarms/services/alarms.service';

@Injectable()
export class SolarCronService {
  private readonly logger = new Logger(SolarCronService.name);
  private cachedDeviceList: any[] = [];
  private lastDeviceListFetchAt = 0;
  private readonly deviceListCacheTtl = 60 * 60 * 1000; // 1 hour
  private rateLimitPauseUntil = 0;
  private readonly rateLimitBackoffMs = 24 * 60 * 60 * 1000; // 24 hours

  constructor(
    @InjectRepository(SolarDevice)
    private readonly deviceRepo: Repository<SolarDevice>,
    @InjectRepository(TelemetryHistory)
    private readonly historyRepo: Repository<TelemetryHistory>,
    @InjectRepository(SolarDailyStats)
    private readonly dailyStatsRepo: Repository<SolarDailyStats>,
    private readonly nengjiaService: NengjiaService,
    private readonly alarmsService: AlarmsService,
  ) { }

  private async evaluateAlarms(device: SolarDevice, telemetry: any): Promise<number[]> {
    const projectId = device.project?.id ?? null;
    const newAlarmIds: number[] = [];

    const isGateway = device.device_type === 'Gateway' || (device.name && device.name.toLowerCase().includes('gateway'));
    this.logger.log(`Evaluating alarms for ${device.serial}. device_type: ${device.device_type}, name: ${device.name}, isGateway: ${isGateway}`);

    if (isGateway) {
      if (device.is_online === 0) {
        const alarm = await this.alarmsService.triggerAlarm({
          serial: device.serial,
          name: device.name,
          device_type: 'solar',
          warning_information: '网关离线',
          english: 'Gateway Offline',
          project_id: projectId,
          skipDispatch: true,
        });
        if (alarm) newAlarmIds.push(alarm.id);
      }
      // Bypass all hardware checks for gateways
      return newAlarmIds;
    }

    // Dynamically determine threshold based on system voltage (12V vs 24V system)
    const is24VSystem = telemetry.battery_voltage > 18;
    const overVoltageThreshold = is24VSystem ? 30.0 : 15.0; // Increased slightly to prevent false alarms from normal charging spikes

    if (telemetry.battery_voltage > overVoltageThreshold) {
      const alarm = await this.alarmsService.triggerAlarm({
        serial: device.serial,
        name: device.name,
        device_type: 'solar',
        warning_information: '蓄电池超压',
        english: 'BatteryOver-voltage',
        project_id: projectId,
        skipDispatch: true,
      });
      if (alarm) newAlarmIds.push(alarm.id);
    }

    // LoadOpenCircuit (Light Not On At Night)
    // We add a grace period by ensuring it's "deep night" (8:00 PM to 5:59 AM) 
    // This gives the lamp plenty of time to turn on after sunset.
    const t = new Date(telemetry.timestamp);
    const hour = t.getHours();
    const isDeepNight = (hour >= 20 || hour <= 5);

    if (telemetry.solar_panel_voltage < 5 && telemetry.is_lighting === 0 && isDeepNight) {
      const alarm = await this.alarmsService.triggerAlarm({
        serial: device.serial,
        name: device.name,
        device_type: 'solar',
        warning_information: '负载开路 (夜间不亮)',
        english: 'LoadOpenCircuit (Light Not On At Night)',
        project_id: projectId,
        skipDispatch: true,
      });
      if (alarm) newAlarmIds.push(alarm.id);
    }

    if (telemetry.battery_percent <= 10) {
      const alarm = await this.alarmsService.triggerAlarm({
        serial: device.serial,
        name: device.name,
        device_type: 'solar',
        warning_information: '电池电量低',
        english: 'LowBattery',
        project_id: projectId,
        skipDispatch: true,
      });
      if (alarm) newAlarmIds.push(alarm.id);
    }

    return newAlarmIds;
  }

  private async getCloudDeviceList() {
    const now = Date.now();

    if (now < this.rateLimitPauseUntil) {
      this.logger.warn('Skipping cloud device list refresh because Nengjia rate limit pause is active.');
      return this.cachedDeviceList;
    }

    if (this.cachedDeviceList.length === 0 || now - this.lastDeviceListFetchAt > this.deviceListCacheTtl) {
      const listRes = await this.nengjiaService.getDeviceList(1, 1000);
      this.cachedDeviceList = listRes.list || [];
      this.lastDeviceListFetchAt = now;
      this.logger.log(`[SOLAR] Refreshed cloud device list.`);
    }

    return this.cachedDeviceList;
  }

  @Cron('*/30 * * * *')
  async handleHistoryTelemetrySync() {
    this.logger.log('[SOLAR] Starting 30-minute history telemetry sync with Nengjia Cloud (Batch by Batch)...');
    const allNewAlarmIds: number[] = [];

    try {
      const devices = await this.deviceRepo.find({ relations: { project: true } });
      if (!devices || devices.length === 0) return;

      let cloudList: any[] = [];
      try {
        cloudList = await this.getCloudDeviceList();
      } catch (err) {
        if (err instanceof HttpException && err.getStatus() === HttpStatus.TOO_MANY_REQUESTS) {
          this.rateLimitPauseUntil = Date.now() + this.rateLimitBackoffMs;
          cloudList = this.cachedDeviceList;
        } else {
          throw err;
        }
      }

      // Process devices batch by batch to prevent Nengjia API rate limits
      const BATCH_SIZE = 5; // Adjust batch size as needed
      for (let i = 0; i < devices.length; i += BATCH_SIZE) {
        const batch = devices.slice(i, i + BATCH_SIZE);
        this.logger.log(`[SOLAR] Processing batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(devices.length / BATCH_SIZE)}`);

        const batchResults = await Promise.all(batch.map(async (device) => {
          if (!device.serial) return [];

          try {
            const cloudBasic = cloudList.find(c => c.serial === device.serial);
            if (cloudBasic) {
              device.is_online = cloudBasic.is_online;
              device.signal_strength = cloudBasic.signal_strength;
            }

            // Force hardware update
            await this.nengjiaService.updateDeviceStatus(device.serial);

            // Get the deep telemetry
            const statusRes = await this.nengjiaService.getDeviceStatus(device.serial);
            const telemetry = statusRes.data ? statusRes.data : statusRes;

            if (telemetry) {
              // Calculate added charge for daily stats
              const oldCharge = Number(device.charge_capacity) || 0;
              const newCharge = Number(telemetry.charge_capacity) || 0;
              const addedChargeWh = newCharge > oldCharge ? newCharge - oldCharge : 0;
              const addedChargeKWh = addedChargeWh / 1000;

              // 1. Update the main device state
              device.battery_power = telemetry.battery_power;
              device.outer_temperature = telemetry.outer_temperature;
              device.run_day = telemetry.run_day;
              device.battery_voltage = telemetry.battery_voltage;
              device.solar_panel_power = telemetry.solar_panel_power;
              device.solar_panel_circuit = telemetry.solar_panel_circuit;
              device.charge_capacity = telemetry.charge_capacity;
              device.discharge_capacity = telemetry.discharge_capacity;
              device.led_power = telemetry.led_power;
              device.battery_circuit = telemetry.battery_circuit;
              device.is_lighting = telemetry.is_lighting;
              device.battery_percent = telemetry.battery_percent;
              device.solar_panel_voltage = telemetry.solar_panel_voltage;
              device.inner_temperature = telemetry.inner_temperature;
              device.led_voltage = telemetry.led_voltage;
              device.led_circuit = telemetry.led_circuit;
              device.timestamp = telemetry.timestamp;
              device.updated_datetime = new Date(); // Force TypeORM to execute UPDATE even if data is unchanged

              await this.deviceRepo.save(device);

              // 2. Insert into History Table for graphs
              const history = this.historyRepo.create({
                serial: device.serial,
                battery_power: telemetry.battery_power,
                outer_temperature: telemetry.outer_temperature,
                battery_voltage: telemetry.battery_voltage,
                solar_panel_power: telemetry.solar_panel_power,
                solar_panel_circuit: telemetry.solar_panel_circuit,
                led_power: telemetry.led_power,
                battery_circuit: telemetry.battery_circuit,
                battery_percent: telemetry.battery_percent,
                solar_panel_voltage: telemetry.solar_panel_voltage,
                inner_temperature: telemetry.inner_temperature,
                led_voltage: telemetry.led_voltage,
                led_circuit: telemetry.led_circuit,
                timestamp: telemetry.timestamp
              });

              await this.historyRepo.save(history);
              this.logger.log(`[SOLAR] Logged historical telemetry for ${device.serial}`);

              // Update Daily Stats
              if (addedChargeKWh > 0) {
                const today = new Date().toISOString().split('T')[0];
                let dailyStat = await this.dailyStatsRepo.findOne({
                  where: { serial: device.serial, date: today }
                });

                const TNB_TARIFF_RM_PER_KWH = 0.192;
                const CO2_KG_PER_KWH = 0.65;
                const moneySaved = addedChargeKWh * TNB_TARIFF_RM_PER_KWH;
                const co2Prevented = addedChargeKWh * CO2_KG_PER_KWH;

                if (!dailyStat) {
                  dailyStat = this.dailyStatsRepo.create({
                    serial: device.serial,
                    projectId: device.project ? device.project.id : null,
                    date: today,
                    energyGeneratedKWh: addedChargeKWh,
                    moneySavedRM: moneySaved,
                    co2PreventedKg: co2Prevented
                  });
                } else {
                  dailyStat.energyGeneratedKWh = Number(dailyStat.energyGeneratedKWh) + addedChargeKWh;
                  dailyStat.moneySavedRM = Number(dailyStat.moneySavedRM) + moneySaved;
                  dailyStat.co2PreventedKg = Number(dailyStat.co2PreventedKg) + co2Prevented;

                  if (device.project) {
                    dailyStat.projectId = device.project.id;
                  }
                }
                await this.dailyStatsRepo.save(dailyStat);
              }

              // 3. Alarm Evaluation Engine
              return await this.evaluateAlarms(device, telemetry);
            }

          } catch (err) {
            this.logger.error(`Failed to sync history telemetry for device ${device.serial}`, err);
          }
          return [];
        }));

        // Flatten and collect all new alarm IDs from this batch
        batchResults.forEach(ids => allNewAlarmIds.push(...ids));

        // Batch by batch delay to prevent rate limits
        if (i + BATCH_SIZE < devices.length) {
          this.logger.log('[SOLAR] Waiting 2 seconds before processing the next batch...');
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      this.logger.log('[SOLAR] History telemetry sync completed.');
    } catch (err) {
      this.logger.error('[SOLAR] Failed to run history telemetry sync cron job', err);
    }

    // ── Dispatch notifications (batched) at the end of the full cycle ──
    // This prevents alarm storms when many devices fail simultaneously.
    if (allNewAlarmIds.length > 0) {
      this.logger.log(`[SOLAR] Dispatching batch summary for ${allNewAlarmIds.length} new alarm(s)...`);
      await this.alarmsService.dispatchBatchSummary(allNewAlarmIds);
    }
  }
}

