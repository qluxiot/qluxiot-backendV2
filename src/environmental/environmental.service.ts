import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import * as net from 'net';
import * as mqtt from 'mqtt';

export interface EnvironmentalTelemetry {
  timestamp: string;
  noise: number;          // dB
  pm25: number;           // µg/m³
  pm10: number;           // µg/m³
  temperature: number;    // °C
  humidity: number;       // %RH
  pressure: number;       // kPa
  windSpeed: number;      // m/s
  windDirection: number;  // degrees (0-360)
  co2?: number;           // ppm
  isOnline: boolean;
  rawHex?: string;
}

@Injectable()
export class EnvironmentalService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EnvironmentalService.name);

  private socket: net.Socket | null = null;
  private pollInterval: NodeJS.Timeout | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private hivemqClient: mqtt.MqttClient | null = null;

  private latestTelemetry: EnvironmentalTelemetry = {
    timestamp: new Date().toISOString(),
    noise: 0,
    pm25: 0,
    pm10: 0,
    temperature: 0,
    humidity: 0,
    pressure: 0,
    windSpeed: 0,
    windDirection: 0,
    isOnline: false,
  };

  private lastReceivedTime = 0;
  private rxBuffer = Buffer.alloc(0);

  // Modbus parameters
  private readonly gatewayHost = process.env.ENV_GATEWAY_HOST || '192.168.155.1';
  private readonly gatewayPort = parseInt(process.env.ENV_GATEWAY_PORT || '502', 10);
  private readonly slaveId = 0xFF; // 255
  private readonly startRegister = 1;
  private readonly registerCount = 18;

  onModuleInit() {
    this.initHiveMq();
    this.connectGateway();
    
    // Check watchdog every 10 seconds for online/offline status
    setInterval(() => {
      const now = Date.now();
      if (this.latestTelemetry.isOnline && now - this.lastReceivedTime > 15000) {
        this.latestTelemetry.isOnline = false;
        this.logger.warn('[Environmental] Sensor telemetry timed out - marked as OFFLINE');
      }
    }, 10000);
  }

  onModuleDestroy() {
    this.cleanup();
  }

  getLiveTelemetry(): EnvironmentalTelemetry {
    return this.latestTelemetry;
  }

  private initHiveMq() {
    const host = process.env.NJIOT_MQTT_URL || '7ccb31028ab341c28fc4fd245aa4b7bd.s1.eu.hivemq.cloud';
    const port = parseInt(process.env.NJIOT_MQTT_PORT || '8883', 10);
    const username = process.env.NJIOT_MQTT_USER || 'root';
    const password = process.env.NJIOT_MQTT_PASS?.replace(/"/g, '') || 'Qwe123##';

    const brokerUrl = `mqtts://${host}:${port}`;
    this.logger.log(`[Environmental HiveMQ] Connecting to ${brokerUrl}...`);

    try {
      this.hivemqClient = mqtt.connect(brokerUrl, {
        username,
        password,
        clientId: `qlux-env-srv-${Date.now()}`,
        reconnectPeriod: 5000,
      });

      this.hivemqClient.on('connect', () => {
        this.logger.log('[Environmental HiveMQ] Successfully connected to HiveMQ Cloud broker');
      });

      this.hivemqClient.on('error', (err) => {
        this.logger.error(`[Environmental HiveMQ Error] ${err.message}`);
      });
    } catch (err: any) {
      this.logger.error(`[Environmental HiveMQ Init Error] ${err.message}`);
    }
  }

  private connectGateway() {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }

    this.logger.log(`[Environmental] Connecting to ser2net at ${this.gatewayHost}:${this.gatewayPort}...`);
    this.socket = new net.Socket();

    this.socket.connect(this.gatewayPort, this.gatewayHost, () => {
      this.logger.log(`[Environmental] Connected to Gateway ${this.gatewayHost}:${this.gatewayPort}`);
      
      const reqFrame = this.buildModbusRequest(this.slaveId, this.startRegister, this.registerCount);
      
      // Query sensor every 2 seconds
      if (this.pollInterval) clearInterval(this.pollInterval);
      this.pollInterval = setInterval(() => {
        if (this.socket && !this.socket.destroyed) {
          this.socket.write(reqFrame);
        }
      }, 2000);

      // Trigger first query immediately
      if (this.socket && !this.socket.destroyed) {
        this.socket.write(reqFrame);
      }
    });

    this.socket.on('data', (chunk: Buffer) => {
      this.rxBuffer = Buffer.concat([this.rxBuffer, chunk]);

      // Expecting 41 bytes: Address (1) + Func (1) + ByteCount (1) + 36 Data Bytes + CRC (2)
      while (this.rxBuffer.length >= 41) {
        // Find header: 0xFF, 0x03, 0x24 (36 bytes of data)
        const headerIdx = this.findHeader(this.rxBuffer);
        if (headerIdx === -1) {
          // No header found, discard leading byte
          this.rxBuffer = this.rxBuffer.slice(1);
          continue;
        }

        if (headerIdx > 0) {
          this.rxBuffer = this.rxBuffer.slice(headerIdx);
        }

        if (this.rxBuffer.length < 41) break;

        const frame = this.rxBuffer.slice(0, 41);
        this.rxBuffer = this.rxBuffer.slice(41);

        this.parseFrame(frame);
      }
    });

    this.socket.on('close', () => {
      this.logger.warn('[Environmental] TCP Socket disconnected. Reconnecting in 5s...');
      this.scheduleReconnect();
    });

    this.socket.on('error', (err) => {
      this.logger.error(`[Environmental TCP Error] ${err.message}`);
    });
  }

  private findHeader(buf: Buffer): number {
    for (let i = 0; i < buf.length - 2; i++) {
      if (buf[i] === 0xFF && buf[i + 1] === 0x03 && buf[i + 2] === 0x24) {
        return i;
      }
    }
    return -1;
  }

  private parseFrame(frame: Buffer) {
    try {
      // Decode registers according to TY-QXY09 specification
      const noise = frame.readUInt16BE(3) * 0.1;
      const pm25 = frame.readUInt16BE(15);
      const pm10 = frame.readUInt16BE(17);
      const temp = (frame.readUInt16BE(19) * 0.01) - 40.0;
      const humidity = frame.readUInt16BE(21) * 0.01;
      const pressure = frame.readUInt16BE(23) * 0.1;
      const windSpeed = frame.readUInt16BE(25) * 0.01;
      const windDir = frame.readUInt16BE(27) * 0.1;
      const co2 = frame.readUInt16BE(37); // Reg 18 = CO2

      this.lastReceivedTime = Date.now();
      this.latestTelemetry = {
        timestamp: new Date().toISOString(),
        noise: Number(noise.toFixed(1)),
        pm25: pm25,
        pm10: pm10,
        temperature: Number(temp.toFixed(2)),
        humidity: Number(humidity.toFixed(2)),
        pressure: Number(pressure.toFixed(1)),
        windSpeed: Number(windSpeed.toFixed(2)),
        windDirection: Number(windDir.toFixed(1)),
        co2: co2 > 0 ? co2 : 415,
        isOnline: true,
        rawHex: frame.toString('hex').toUpperCase(),
      };

      // Publish to HiveMQ Cloud
      if (this.hivemqClient && this.hivemqClient.connected) {
        const topic = 'qlux/smartpole/sp001/environmental';
        this.hivemqClient.publish(topic, JSON.stringify(this.latestTelemetry));
      }
    } catch (e: any) {
      this.logger.error(`[Environmental] Failed to parse frame: ${e.message}`);
    }
  }

  private buildModbusRequest(slaveId: number, startReg: number, count: number): Buffer {
    const buf = Buffer.alloc(6);
    buf.writeUInt8(slaveId, 0);
    buf.writeUInt8(3, 1);
    buf.writeUInt16BE(startReg, 2);
    buf.writeUInt16BE(count, 4);
    const crc = this.modbusCrc16(buf);
    const crcBuf = Buffer.alloc(2);
    crcBuf.writeUInt16LE(crc, 0);
    return Buffer.concat([buf, crcBuf]);
  }

  private modbusCrc16(buffer: Buffer): number {
    let crc = 0xFFFF;
    for (let pos = 0; pos < buffer.length; pos++) {
      crc ^= buffer[pos];
      for (let i = 8; i !== 0; i--) {
        if ((crc & 0x0001) !== 0) {
          crc >>= 1;
          crc ^= 0xA001;
        } else {
          crc >>= 1;
        }
      }
    }
    return crc;
  }

  private scheduleReconnect() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    this.reconnectTimeout = setTimeout(() => {
      this.connectGateway();
    }, 5000);
  }

  private cleanup() {
    if (this.pollInterval) clearInterval(this.pollInterval);
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    if (this.hivemqClient) {
      this.hivemqClient.end();
      this.hivemqClient = null;
    }
  }
}
