import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import * as net from 'net';
import { PanicButtonDevice, PanicButtonEvent } from './panic-button.types';

@Injectable()
export class PanicButtonService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PanicButtonService.name);

  private readonly DEVICE_IP = '192.168.155.241';
  private readonly DEVICE_PORT = 554; // RTSP port is open on device
  private readonly SERIAL_NUMBER = '202217230199222';
  private readonly MAC_ADDRESS = 'b0:a8:79:7a:ba:98';

  private checkInterval: NodeJS.Timeout | null = null;
  private alertTimeout: NodeJS.Timeout | null = null;

  private device: PanicButtonDevice = {
    id: 1,
    name: 'Panic Button PB-01',
    poleId: 'SP-001',
    serialNumber: this.SERIAL_NUMBER,
    ipAddress: this.DEVICE_IP,
    macAddress: this.MAC_ADDRESS,
    location: 'Smart Pole 01 (Bertam / Local Lab)',
    status: 'standby',
    isOnline: true,
    battery: 100, // Powered directly via 12V DC
    lastPressed: 'Never',
    pressedBy: null,
    responseTime: null,
    incidentCount: 0,
    lastChecked: 'Just now',
    signalStrength: 5,
    rtspUrl: `rtsp://192.168.155.241:554`,
    webrtcUrl: `https://mortgage-engaged-transmission-rep.trycloudflare.com/panic_button/`,
  };

  private events: PanicButtonEvent[] = [];

  onModuleInit() {
    this.logger.log(`[PanicButton] Initializing localhost monitor for device ${this.DEVICE_IP}...`);
    this.checkHealth();
    // Check health every 5 seconds
    this.checkInterval = setInterval(() => this.checkHealth(), 5000);
  }

  onModuleDestroy() {
    if (this.checkInterval) clearInterval(this.checkInterval);
    if (this.alertTimeout) clearTimeout(this.alertTimeout);
  }

  /**
   * Health check: verify device connectivity across ports
   */
  public async checkHealth(): Promise<boolean> {
    const ports = [554, 22, 8533, 8600];
    let isUp = false;

    for (const p of ports) {
      if (await this.testSocket(this.DEVICE_IP, p, 1000)) {
        isUp = true;
        break;
      }
    }

    this.device.isOnline = isUp;
    this.device.lastChecked = new Date().toLocaleTimeString('en-MY', { hour12: true });

    // Do NOT overwrite an active emergency alarm during background health check!
    if (this.device.status !== 'active') {
      if (!isUp) {
        this.device.status = 'offline';
      } else {
        this.device.status = 'standby';
      }
    }

    return isUp;
  }

  private testSocket(host: string, port: number, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(timeoutMs);

      socket.connect(port, host, () => {
        socket.destroy();
        resolve(true);
      });

      socket.on('error', () => {
        socket.destroy();
        resolve(false);
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });
    });
  }

  /**
   * Return the list of panic button devices (real hardware only)
   */
  public getDevices(): PanicButtonDevice[] {
    return [this.device];
  }

  /**
   * Return the live state
   */
  public getLive(): { device: PanicButtonDevice; recentEvents: PanicButtonEvent[] } {
    return {
      device: this.device,
      recentEvents: this.events.slice(-10).reverse(),
    };
  }

  private lastTriggerTime = 0;

  /**
   * Trigger SOS Alarm (called when button is pressed on hardware)
   */
  public triggerAlarm(pressedBy: string = 'SOS Button Pressed (Physical Hardware)'): PanicButtonDevice {
    const now = Date.now();
    // Debounce: ignore triggers within 10 seconds or if alarm is already active
    if (this.device.status === 'active' || (now - this.lastTriggerTime < 10000)) {
      return this.device;
    }
    this.lastTriggerTime = now;

    const nowStr = new Date().toLocaleTimeString('en-MY', { hour12: true });
    this.logger.warn(`🚨 [PanicButton] EMERGENCY ALARM TRIGGERED on ${this.device.poleId} (${this.device.ipAddress})!`);

    this.device.status = 'active';
    this.device.lastPressed = `${nowStr} (Today)`;
    this.device.pressedBy = pressedBy;
    this.device.responseTime = 'In Progress...';
    this.device.incidentCount += 1;

    const event: PanicButtonEvent = {
      id: `evt-${Date.now()}`,
      timestamp: new Date().toISOString(),
      deviceIp: this.DEVICE_IP,
      serialNumber: this.SERIAL_NUMBER,
      poleId: this.device.poleId,
      eventType: 'SOS_PRESSED',
      details: pressedBy,
    };
    this.events.push(event);

    return this.device;
  }

  /**
   * Dismiss / Acknowledge Alarm
   */
  public dismissAlarm(operatorName: string = 'Operator'): PanicButtonDevice {
    this.logger.log(`[PanicButton] Alarm acknowledged & dismissed by ${operatorName}`);

    if (this.device.status === 'active') {
      this.device.status = this.device.isOnline ? 'standby' : 'offline';
      this.device.responseTime = 'Resolved';
    }

    const event: PanicButtonEvent = {
      id: `evt-${Date.now()}`,
      timestamp: new Date().toISOString(),
      deviceIp: this.DEVICE_IP,
      serialNumber: this.SERIAL_NUMBER,
      poleId: this.device.poleId,
      eventType: 'ALARM_DISMISSED',
      details: `Acknowledged by ${operatorName}`,
    };
    this.events.push(event);

    return this.device;
  }
}
