import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BertamDevice } from '../entities/bertam-device.entity';
import { BertamTelemetryHistory } from '../entities/bertam-telemetry-history.entity';
import { BertamDailyStats } from '../entities/bertam-daily-stats.entity';
import * as mqtt from 'mqtt';

@Injectable()
export class BertamMqttService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BertamMqttService.name);
  private client: mqtt.MqttClient | null = null;
  private lastHistorySave = new Map<string, number>();

  // Map from raw modbus_chn_12 code -> brightness label
  private readonly BRIGHTNESS_MAP: Record<number, string> = {
    58368: '100%',
    48128: '60%',
    43008: '40%',
  };

  private readonly SITE_1_EUIS = new Set([
    '24e124468e235472', '24e124468e235424', '24e124468e234983', '24e124468e235654',
    '24e124468e235322', '24e124468e234912', '24e124468e235331', '24e124468e235359',
    '24e124468e234981', '24e124468e235770', '24e124468e239578', '24e124468e234882',
    '24e124468e235759', '24e124468e235369', '24e124468e232573', '24e124468e235471',
    '24e124468e235389', '24e124468e235388', '24e124468e235474', '24e124468e234899',
    '24e124468e235152', '24e124468e235227', '24e124468e235309', '24e124468e235865',
    '24e124468e239600', '24e124468e239335', '24e124468e232501', '24e124468e235117',
    '24e124468e235826', '24e124468e235467', '24e124468e235632', '24e124468e235486',
    '24e124468e235734', '24e124468e239593', '24e124468e235315', '24e124468e235230',
    '24e124468e235593', '24e124468e234335'
  ]);

  private readonly SITE_2_EUIS = new Set([
    '24e124468e234963', '24e124468e234876', '24e124468e234745', '24e124468e235852',
    '24e124468e235129', '24e124468e235167', '24e124468e235148', '24e124468e235113',
    '24e124468e234864', '24e124468e235099', '24e124468e235233', '24e124468e235039',
    '24e124468e235182', '24e124468e231633', '24e124468e234809', '24e124468e234964',
    '24e124468e235000', '24e124468e234872', '24e124468e234797', '24e124468e235408',
    '24e124468e234996', '24e124468e234950', '24e124468e235755', '24e124468e235792'
  ]);

  constructor(
    @InjectRepository(BertamDevice)
    private readonly deviceRepo: Repository<BertamDevice>,
    @InjectRepository(BertamTelemetryHistory)
    private readonly historyRepo: Repository<BertamTelemetryHistory>,
    @InjectRepository(BertamDailyStats)
    private readonly dailyStatsRepo: Repository<BertamDailyStats>,
  ) {}

  onModuleInit() {
    this.connect();
  }

  onModuleDestroy() {
    if (this.client) {
      this.client.end();
    }
  }

  private connect() {
    const brokerUrl = process.env.ISURIAN_MQTT_URL || 'mqtt://mqtt.isurianiot.com:1883';
    const username = process.env.ISURIAN_MQTT_USER || 'isurian';
    const password = process.env.ISURIAN_MQTT_PASS || 'Isurianadmin1!';

    this.logger.log(`[Bertam MQTT] Connecting to ${brokerUrl}...`);

    this.client = mqtt.connect(brokerUrl, {
      username,
      password,
      clientId: `qlux-bertam-${Date.now()}`,
      reconnectPeriod: 5000,
      connectTimeout: 30000,
    });

    this.client.on('connect', () => {
      this.logger.log('[Bertam MQTT] Connected! Subscribing to qluxssl and qluxsslupdate/device/data...');
      this.client?.subscribe('qluxssl', { qos: 1 }, (err) => {
        if (err) this.logger.error('[Bertam MQTT] Subscribe to qluxssl failed', err);
        else this.logger.log('[Bertam MQTT] Subscribed to topic: qluxssl');
      });
      this.client?.subscribe('qluxsslupdate/device/data', { qos: 1 }, (err) => {
        if (err) this.logger.error('[Bertam MQTT] Subscribe to qluxsslupdate failed', err);
        else this.logger.log('[Bertam MQTT] Subscribed to topic: qluxsslupdate/device/data');
      });
    });

    this.client.on('message', (topic, message) => {
      this.handleMessage(topic, message);
    });

    this.client.on('error', (err) => {
      this.logger.error('[Bertam MQTT] Connection error:', err.message);
    });

    this.client.on('reconnect', () => {
      this.logger.warn('[Bertam MQTT] Reconnecting...');
    });

    this.client.on('offline', () => {
      this.logger.warn('[Bertam MQTT] Client went offline');
    });
  }

  private async handleMessage(topic: string, message: Buffer) {
    try {
      const parsed = JSON.parse(message.toString());
      const payloads = Array.isArray(parsed) ? parsed : [parsed];
      for (const payload of payloads) {
        this.logger.log(`[Bertam MQTT] Received on ${topic}: dev_eui=${payload?.dev_eui}`);
        if (payload?.dev_eui) {
          await this.processTelemetry(payload);
        }
      }
    } catch (err) {
      this.logger.error('[Bertam MQTT] Failed to parse message', err);
    }
  }

  private async processTelemetry(payload: any) {
    const devEui = payload.dev_eui;
    if (!devEui) return;

    // Upsert device record
    let device = await this.deviceRepo.findOne({ where: { dev_eui: devEui } });
    
    let siteName = 'Unassigned';
    if (this.SITE_1_EUIS.has(devEui)) siteName = 'Site 1';
    else if (this.SITE_2_EUIS.has(devEui)) siteName = 'Site 2';
    
    if (!device) {
      device = this.deviceRepo.create({ dev_eui: devEui, name: devEui, site_name: siteName });
      this.logger.log(`[Bertam MQTT] Auto-registered new device: ${devEui} to ${siteName}`);
    } else {
      device.site_name = siteName;
    }

    const parseVoltage = (val: any) => {
      if (val == null) return val;
      let num = Number(val);
      // Iteratively scale down until < 60V (realistic for 12V/24V solar system)
      while (num > 60) {
        num /= 10;
      }
      return num;
    };

    const parseTemperature = (val: any) => {
      if (val == null) return val;
      const num = Number(val);
      if (num > 8000) {
        // Fahrenheit * 100
        const fahrenheit = num / 100;
        return (fahrenheit - 32) * 5 / 9;
      } else if (num >= 100 && num <= 1000) {
        // Celsius * 10
        return num / 10;
      }
      return num;
    };

    device.gateway_id     = payload.gateway_id ?? device.gateway_id;
    device.rssi           = payload.rssi ?? device.rssi;
    device.snr            = payload.snr ?? device.snr;
    device.alarm1         = payload.modbus_chn_1 ?? device.alarm1;
    device.battery_percent= payload.modbus_chn_2 ?? device.battery_percent;
    device.battery_voltage = parseVoltage(payload.modbus_chn_3) ?? device.battery_voltage;
    device.solar_panel_voltage = parseVoltage(payload.modbus_chn_4) ?? device.solar_panel_voltage;
    device.solar_current  = payload.modbus_chn_5 ?? device.solar_current;
    
    // Process Energy Delta for Daily Stats
    const oldCharge = Number(device.charge) || 0;
    const newCharge = Number(payload.modbus_chn_6);
    if (!isNaN(newCharge)) {
      device.charge = newCharge;
      
      const addedChargeAh = newCharge > oldCharge ? newCharge - oldCharge : 0;
      if (addedChargeAh > 0) {
        // Calculate kWh based on nominal 24V system
        const addedChargeKWh = (addedChargeAh * 24) / 1000;
        const today = new Date().toISOString().split('T')[0];
        
        let dailyStat = await this.dailyStatsRepo.findOne({ where: { dev_eui: devEui, date: today } });
        
        const TNB_TARIFF_RM_PER_KWH = 0.192;
        const CO2_KG_PER_KWH = 0.65;
        const moneySaved = addedChargeKWh * TNB_TARIFF_RM_PER_KWH;
        const co2Prevented = addedChargeKWh * CO2_KG_PER_KWH;

        if (!dailyStat) {
          dailyStat = this.dailyStatsRepo.create({
            dev_eui: devEui,
            date: today,
            energyGeneratedKWh: addedChargeKWh,
            moneySavedRM: moneySaved,
            co2PreventedKg: co2Prevented
          });
        } else {
          dailyStat.energyGeneratedKWh = Number(dailyStat.energyGeneratedKWh) + addedChargeKWh;
          dailyStat.moneySavedRM = Number(dailyStat.moneySavedRM) + moneySaved;
          dailyStat.co2PreventedKg = Number(dailyStat.co2PreventedKg) + co2Prevented;
        }
        await this.dailyStatsRepo.save(dailyStat);
      }
    }

    device.max_charge     = payload.modbus_chn_7 ?? device.max_charge;
    device.consumption    = payload.modbus_chn_8 ?? device.consumption;
    device.brightness_mode = payload.modbus_chn_9 ?? device.brightness_mode;
    device.led_status     = payload.modbus_chn_10 ?? device.led_status;
    device.battery_temp   = parseTemperature(payload.modbus_chn_11) ?? device.battery_temp;
    device.brightness_code = payload.modbus_chn_12 ?? device.brightness_code;
    device.alarm2         = payload.modbus_chn_13 ?? device.alarm2;
    device.duration_100   = payload.modbus_chn_14 ?? device.duration_100;
    device.duration_40    = payload.modbus_chn_15 ?? device.duration_40;
    device.duration_60    = payload.modbus_chn_16 ?? device.duration_60;

    // Ignore the third-party's broken timestamp completely. 
    // We receive this MQTT packet in real-time, so our server's exact current time is the source of truth!
    const exactServerTime = new Date().toISOString();

    device.timestamp      = exactServerTime;
    device.is_online      = 1;
    device.updated_datetime = new Date();

    await this.deviceRepo.save(device);

    // ── Throttled History Insertion (15-minute interval) ──
    const nowMs = Date.now();
    const lastSaveTime = this.lastHistorySave.get(devEui) || 0;
    const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

    if (nowMs - lastSaveTime >= FIFTEEN_MINUTES_MS) {
      // Insert history record
      const history = this.historyRepo.create({
        dev_eui:            devEui,
        battery_percent:    payload.modbus_chn_2,
        battery_voltage:    parseVoltage(payload.modbus_chn_3),
        solar_panel_voltage:parseVoltage(payload.modbus_chn_4),
        solar_current:      payload.modbus_chn_5,
        charge:             payload.modbus_chn_6,
        consumption:        payload.modbus_chn_8,
        led_status:         payload.modbus_chn_10,
        battery_temp:       parseTemperature(payload.modbus_chn_11),
        brightness_code:    payload.modbus_chn_12,
        rssi:               payload.rssi,
        snr:                payload.snr,
        timestamp:          exactServerTime,
      });
      await this.historyRepo.save(history);
      
      // Update the cache with the new save time
      this.lastHistorySave.set(devEui, nowMs);
    }
  }
}
