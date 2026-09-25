import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Uc100Device } from '../entities/uc100-device.entity';
import { Uc100TelemetryHistory } from '../entities/uc100-telemetry-history.entity';
import { Uc100DailyStats } from '../entities/uc100-daily-stats.entity';
import * as mqtt from 'mqtt';

@Injectable()
export class Uc100MqttService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(Uc100MqttService.name);
  private client: mqtt.MqttClient | null = null;
  private lastHistorySave = new Map<string, number>();

  // TNB tariff and CO2 constants (Malaysia)
  private readonly TNB_TARIFF_RM_PER_KWH = 0.192;
  private readonly CO2_KG_PER_KWH = 0.65;

  // Topic prefix from gateway configuration
  // Uplink:   application/1/device/<devEUI>/rx
  // Downlink: application/1/device/<devEUI>/tx
  private readonly UPLINK_TOPIC = 'application/1/device/+/rx';

  constructor(
    @InjectRepository(Uc100Device)
    private readonly deviceRepo: Repository<Uc100Device>,
    @InjectRepository(Uc100TelemetryHistory)
    private readonly historyRepo: Repository<Uc100TelemetryHistory>,
    @InjectRepository(Uc100DailyStats)
    private readonly dailyStatsRepo: Repository<Uc100DailyStats>,
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
    const host = process.env.UC100_MQTT_URL || '44be5c51b9dd4209b80f023fd53c70f3.s1.eu.hivemq.cloud';
    const port = parseInt(process.env.UC100_MQTT_PORT || '8883', 10);
    const username = process.env.UC100_MQTT_USER || 'root';
    const password = process.env.UC100_MQTT_PASS || 'Qwe123##';

    const brokerUrl = `mqtts://${host}:${port}`;

    this.logger.log(`[UC100 MQTT] Connecting to ${brokerUrl}...`);

    this.client = mqtt.connect(brokerUrl, {
      username,
      password,
      clientId: `qlux-uc100-${Date.now()}`,
      reconnectPeriod: 5000,
      connectTimeout: 30000,
    });

    this.client.on('connect', () => {
      this.logger.log(`[UC100 MQTT] Connected! Subscribing to ${this.UPLINK_TOPIC}...`);
      this.client?.subscribe(this.UPLINK_TOPIC, { qos: 1 }, (err) => {
        if (err) this.logger.error('[UC100 MQTT] Subscribe failed', err);
        else this.logger.log(`[UC100 MQTT] Subscribed to topic: ${this.UPLINK_TOPIC}`);
      });
    });

    this.client.on('message', (topic, message) => {
      this.handleMessage(topic, message);
    });

    this.client.on('error', (err) => {
      this.logger.error('[UC100 MQTT] Connection error:', err.message);
    });

    this.client.on('reconnect', () => {
      this.logger.warn('[UC100 MQTT] Reconnecting...');
    });

    this.client.on('offline', () => {
      this.logger.warn('[UC100 MQTT] Client went offline');
    });
  }

  private async handleMessage(topic: string, message: Buffer) {
    try {
      const payload = JSON.parse(message.toString());
      const devEUI = payload?.devEUI;
      this.logger.log(`[UC100 MQTT] Received on ${topic}: devEUI=${devEUI}`);
      if (devEUI) {
        await this.processTelemetry(payload);
      }
    } catch (err) {
      this.logger.error('[UC100 MQTT] Failed to parse message', err);
    }
  }

  private async processTelemetry(payload: any) {
    const devEUI = payload.devEUI;
    if (!devEUI) return;

    // ── Upsert Device Record ────────────────────────────────────────────────
    let device = await this.deviceRepo.findOne({ where: { dev_eui: devEUI } });

    if (!device) {
      device = this.deviceRepo.create({
        dev_eui: devEUI,
        name: payload.deviceName || devEUI,
        application_id: payload.applicationID,
      });
      this.logger.log(`[UC100 MQTT] Auto-registered new device: ${devEUI}`);
    }

    // ── Parse Helpers ──────────────────────────────────────────────────────
    const parseVoltage = (val: any): number | undefined => {
      if (val == null) return undefined;
      let num = Number(val);
      // Solar controller Modbus registers are usually integers representing 0.1V increments.
      // E.g., 125 = 12.5V. 97 = 9.7V.
      if (num > 1000) return Number((num / 100).toFixed(2));
      return Number((num / 10).toFixed(2));
    };

    const parseTemperature = (val: any): number | undefined => {
      if (val == null) return undefined;
      const num = Number(val);
      if (isNaN(num)) return undefined;
      
      // The device sends temperature in Fahrenheit * 100 (e.g. 8223 = 82.23°F)
      // Convert Fahrenheit to Celsius: (F - 32) * 5/9
      // If the number is weirdly small (like < 1000), it might be Celsius * 10, handle it just in case.
      if (num > 1000) {
        return Number((((num / 100) - 32) * 5 / 9).toFixed(2));
      }
      return Number((num / 10).toFixed(2));
    };

    // Attempt to extract RSSI and SNR from common LoRaWAN Network Server formats (like ChirpStack)
    let parsedRssi = payload.rssi;
    let parsedSnr = payload.snr ?? payload.loRaSNR;
    
    if (payload.rxInfo && Array.isArray(payload.rxInfo) && payload.rxInfo.length > 0) {
      parsedRssi = parsedRssi ?? payload.rxInfo[0].rssi;
      parsedSnr = parsedSnr ?? payload.rxInfo[0].loRaSNR ?? payload.rxInfo[0].snr;
    }

    // Helper to safely parse brightness (some controllers return error codes like 48128)
    const parseBrightness = (val: any): number | undefined => {
      if (val == null) return undefined;
      let num = Number(val);
      if (isNaN(num)) return undefined;
      // Cap brightness at 100% to prevent graph scaling issues from error codes (like 48128)
      if (num > 100) num = 100;
      if (num < 0) num = 0;
      return num;
    };

    // ── Map Modbus Channels to Device Fields ───────────────────────────────
    device.application_id  = payload.applicationID ?? device.application_id;
    device.alarm1          = payload.modbus_chn_1  ?? device.alarm1;
    device.battery_percent = payload.modbus_chn_2  ?? device.battery_percent;
    device.battery_voltage   = parseVoltage(payload.modbus_chn_3) ?? device.battery_voltage;
    
    let rawSolarVoltage = parseVoltage(payload.modbus_chn_4) ?? device.solar_panel_voltage;
    let rawSolarCurrent = payload.modbus_chn_5 ?? device.solar_current;
    
    // Determine if the light is currently ON (load power > 0)
    let isLightOn = device.led_status > 0;
    if (payload.modbus_chn_10 !== undefined) {
      isLightOn = Number(payload.modbus_chn_10) > 0;
    }
    
    // If the light is ON (it's night time), force the solar voltage to 0 to ignore residual panel voltage.
    // This supports any battery voltage (12V/24V) dynamically.
    if (isLightOn) {
      rawSolarVoltage = 0.0;
      rawSolarCurrent = 0.0;
    }
    
    device.solar_panel_voltage = rawSolarVoltage;
    device.solar_current       = rawSolarCurrent;
    device.rssi                = parsedRssi ?? device.rssi;
    device.snr                 = parsedSnr ?? device.snr;

    // ── Energy Delta for Daily Stats ───────────────────────────────────────
    const oldCharge = Number(device.charge) || 0;
    const newCharge = Number(payload.modbus_chn_6);
    if (!isNaN(newCharge)) {
      device.charge = newCharge;
      const addedChargeAh = newCharge > oldCharge ? newCharge - oldCharge : 0;
      if (addedChargeAh > 0) {
        // Dynamically detect nominal voltage: if battery > 18V it's a 24V system, else 12V system
        const currentBatteryV = device.battery_voltage || 12; // Fallback to 12 if undefined
        const dynamicNominalVoltage = currentBatteryV > 18 ? 24 : 12;

        const addedChargeKWh = (addedChargeAh * dynamicNominalVoltage) / 1000;
        const today = new Date().toISOString().split('T')[0];
        let dailyStat = await this.dailyStatsRepo.findOne({ where: { dev_eui: devEUI, date: today } });

        const moneySaved = addedChargeKWh * this.TNB_TARIFF_RM_PER_KWH;
        const co2Prevented = addedChargeKWh * this.CO2_KG_PER_KWH;

        if (!dailyStat) {
          dailyStat = this.dailyStatsRepo.create({
            dev_eui: devEUI,
            date: today,
            energyGeneratedKWh: addedChargeKWh,
            moneySavedRM: moneySaved,
            co2PreventedKg: co2Prevented,
          });
        } else {
          dailyStat.energyGeneratedKWh = Number(dailyStat.energyGeneratedKWh) + addedChargeKWh;
          dailyStat.moneySavedRM = Number(dailyStat.moneySavedRM) + moneySaved;
          dailyStat.co2PreventedKg = Number(dailyStat.co2PreventedKg) + co2Prevented;
        }
        await this.dailyStatsRepo.save(dailyStat);
      }
    }

    device.max_charge        = payload.modbus_chn_7  ?? device.max_charge;
    device.consumption       = payload.modbus_chn_8  ?? device.consumption;
    device.brightness_setting= parseBrightness(payload.modbus_chn_9)  ?? device.brightness_setting;
    device.led_status        = payload.modbus_chn_10 ?? device.led_status;
    device.battery_temp      = parseTemperature(payload.modbus_chn_11) ?? device.battery_temp;
    
    // The controller repurposes the brightness_actual register during the daytime to send 
    // battery charging status codes (e.g., 2 = MPPT, 4 = Float charging).
    // To prevent the graph from showing 2% or 4% brightness during the day, we force it to 0 when the light is OFF.
    let rawBrightnessActual = parseBrightness(payload.modbus_chn_12) ?? device.brightness_actual;
    if (!isLightOn) {
      rawBrightnessActual = 0;
    }
    device.brightness_actual = rawBrightnessActual;
    device.alarm2            = payload.modbus_chn_13 ?? device.alarm2;
    device.timer_1           = payload.modbus_chn_14 ?? device.timer_1;
    device.timer_2           = payload.modbus_chn_15 ?? device.timer_2;
    device.timer_3           = payload.modbus_chn_16 ?? device.timer_3;
    device.timer_1_dim       = parseBrightness(payload.modbus_chn_9)  ?? device.timer_1_dim; // Timer 1 uses overall Brightness Setting
    device.timer_2_dim       = parseBrightness(payload.modbus_chn_17) ?? device.timer_2_dim; // Timer 2 Dim %
    device.timer_3_dim       = parseBrightness(payload.modbus_chn_18) ?? device.timer_3_dim; // Timer 3 Dim %

    // Use server time as the source of truth for the timestamp
    const exactServerTime = new Date().toISOString();
    device.timestamp       = exactServerTime;
    device.is_online       = 1;
    device.updated_datetime = new Date();

    await this.deviceRepo.save(device);

    // ── Throttled History Insertion (every 30 minutes) ─────────────────────
    const THIRTY_MINUTES_MS = 30 * 60 * 1000;
    
    // Check DB for the most recent history record for this device
    const lastHistory = await this.historyRepo.findOne({
      where: { dev_eui: devEUI },
      order: { created_datetime: 'DESC' }
    });

    const nowMs = Date.now();
    const lastSaveTime = lastHistory ? new Date(lastHistory.created_datetime).getTime() : 0;

    if (nowMs - lastSaveTime >= THIRTY_MINUTES_MS) {
      const history = this.historyRepo.create({
        dev_eui:           devEUI,
        battery_percent:   payload.modbus_chn_2,
        battery_voltage:   parseVoltage(payload.modbus_chn_3),
        solar_panel_voltage: rawSolarVoltage,
        solar_current:     rawSolarCurrent,
        charge:            payload.modbus_chn_6,
        consumption:       payload.modbus_chn_8,
        brightness_setting: parseBrightness(payload.modbus_chn_9),
        brightness_actual:  rawBrightnessActual,
        led_status:        payload.modbus_chn_10,
        battery_temp:      device.battery_temp,
        rssi:              parsedRssi,
        snr:               payload.snr,
        timestamp:         exactServerTime,
      });
      await this.historyRepo.save(history);
      this.logger.log(`[UC100 MQTT] History snapshot saved for ${devEUI}`);
    }
  }

  // ── Downlink Hex Payload Builders ──────────────────────────────────────────
  // Based on Milesight UC100 Modbus RTU command format:
  // 0x01 0x06 <reg_hi> <reg_lo> <val_hi> <val_lo> <crc_lo> <crc_hi>
  // Function 06 = Write Single Register

  /** CRC16 Modbus checksum */
  private crc16(buf: Buffer): number {
    let crc = 0xFFFF;
    for (let i = 0; i < buf.length; i++) {
      crc ^= buf[i];
      for (let j = 0; j < 8; j++) {
        if (crc & 0x0001) { crc = (crc >> 1) ^ 0xA001; }
        else { crc >>= 1; }
      }
    }
    return crc;
  }

  /**
   * Build a Modbus RTU Write Single Register frame.
   * @param register - The Modbus register address (e.g. 0xE093 for brightness)
   * @param value    - The 16-bit value to write
   */
  private buildModbusFrame(register: number, value: number): Buffer {
    const frame = Buffer.alloc(6);
    frame[0] = 0x01;                        // Slave address
    frame[1] = 0x06;                        // Function: Write Single Register
    frame[2] = (register >> 8) & 0xFF;      // Register address high byte
    frame[3] = register & 0xFF;             // Register address low byte
    frame[4] = (value >> 8) & 0xFF;         // Value high byte
    frame[5] = value & 0xFF;               // Value low byte
    const crc = this.crc16(frame);
    const full = Buffer.alloc(8);
    frame.copy(full);
    full[6] = crc & 0xFF;                  // CRC low byte
    full[7] = (crc >> 8) & 0xFF;           // CRC high byte
    return full;
  }

  /**
   * Known Modbus register addresses for the UC100 solar controller.
   * Source: QLUX Isurian Smart Solar Monitoring System MQTT Manual V6
   */
  private readonly UC100_REGISTERS = {
    brightness: 0xE093,    // modbus_chn_9  – Brightness % (0=OFF, 100=full)
    timer1:     0xE092,    // modbus_chn_14 – Timer 1 duration (hours)
    timer2:     0xE095,    // modbus_chn_15 – Timer 2 duration (hours)
    timer3:     0xE098,    // modbus_chn_16 – Timer 3 duration (hours)
    timer2Dim:  0xE094,    // modbus_chn_17 – Timer 2 brightness (%)
    timer3Dim:  0xE097,    // modbus_chn_18 – Timer 3 brightness (%) ← 0xE097 confirmed from ToolBox JSON
  };

  /**
   * Send a downlink command to a specific UC100 device via the Milesight gateway.
   * The gateway expects a JSON wrapper with fPort and base64-encoded Modbus RTU payload.
   *
   * Format: { "confirmed": false, "fPort": 85, "data": "<base64>" }
   */
  async sendDownlink(devEUI: string, action: string, options?: { power?: number; timer1?: number; timer2?: number; timer3?: number; timer1Dim?: number; timer2Dim?: number; timer3Dim?: number }): Promise<void> {
    if (!this.client || !this.client.connected) {
      throw new Error('[UC100 MQTT] MQTT client is not connected');
    }

    const fPort = 90; // Port 90 is required for UC100 control commands
    const topic = `application/1/device/${devEUI}/tx`;

    const publish = (frame: Buffer): Promise<void> => {
      const payload = JSON.stringify({ confirmed: false, fPort, data: frame.toString('base64') });
      this.logger.log(`[UC100 MQTT] Downlink to ${devEUI}: ${frame.toString('hex')}`);
      return new Promise((resolve, reject) => {
        this.client!.publish(topic, payload, { qos: 1 }, (err) => {
          if (err) reject(err); else resolve();
        });
      });
    };

    const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

    switch (action) {
      case 'ON':
        await publish(this.buildModbusFrame(this.UC100_REGISTERS.brightness, options?.power ?? 100));
        break;
      case 'OFF':
        await publish(this.buildModbusFrame(this.UC100_REGISTERS.brightness, 0));
        break;
      case 'DIM':
        await publish(this.buildModbusFrame(this.UC100_REGISTERS.brightness, Math.min(100, Math.max(0, options?.power ?? 100))));
        break;
      case 'SET_TIMER1':
      case 'SET_TIMER2':
      case 'SET_TIMER3':
        this.logger.log(`[UC100 MQTT] ${action} command ignored for ${devEUI}. Using remote control directly.`);
        /*
        if (action === 'SET_TIMER1') await publish(this.buildModbusFrame(this.UC100_REGISTERS.timer1, options?.timer1 ?? 14400));
        else if (action === 'SET_TIMER2') await publish(this.buildModbusFrame(this.UC100_REGISTERS.timer2, options?.timer2 ?? 21600));
        else if (action === 'SET_TIMER3') await publish(this.buildModbusFrame(this.UC100_REGISTERS.timer3, options?.timer3 ?? 7200));
        */
        break;
      case 'SET_TIMERS': {
        this.logger.log(`[UC100 MQTT] SET_TIMERS command ignored for ${devEUI}. Using remote control directly.`);
        /*
        // The controller natively expects the duration in seconds!
        const t1 = options?.timer1 ?? 14400;
        const t2 = options?.timer2 ?? 7200;
        const t3 = options?.timer3 ?? 21600;
        const t1Dim = options?.timer1Dim ?? 100;
        const t2Dim = options?.timer2Dim ?? 60;
        const t3Dim = options?.timer3Dim ?? 40;

        // Send all 6 frames with a short delay between each to avoid flooding
        await publish(this.buildModbusFrame(this.UC100_REGISTERS.brightness,t1Dim));  await delay(300); // Stage 1 Brightness
        await publish(this.buildModbusFrame(this.UC100_REGISTERS.timer1,    t1));     await delay(300); // Stage 1 Duration
        await publish(this.buildModbusFrame(this.UC100_REGISTERS.timer2Dim, t2Dim));  await delay(300); // Stage 2 Brightness
        await publish(this.buildModbusFrame(this.UC100_REGISTERS.timer2,    t2));     await delay(300); // Stage 2 Duration
        await publish(this.buildModbusFrame(this.UC100_REGISTERS.timer3Dim, t3Dim));  await delay(300); // Stage 3 Brightness
        await publish(this.buildModbusFrame(this.UC100_REGISTERS.timer3,    t3));                       // Stage 3 Duration
        
        this.logger.log(`[UC100 MQTT] SET_TIMERS complete for ${devEUI}: t1=${t1}s/${t1Dim}% t2=${t2}s/${t2Dim}% t3=${t3}s/${t3Dim}%`);
        */
        break;
      }
      default:
        throw new Error(`[UC100 MQTT] Unknown action: ${action}`);
    }
  }

  /** Check if the MQTT client is currently connected */
  isConnected(): boolean {
    return !!(this.client && this.client.connected);
  }
}
