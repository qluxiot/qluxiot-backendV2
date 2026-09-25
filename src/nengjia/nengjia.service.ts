import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import axios from 'axios';
import { LightAction } from './nengjia.types';

@Injectable()
export class NengjiaService {
  private readonly logger = new Logger(NengjiaService.name);

  private baseUrl = process.env.NENGJIA_BASE_URL || 'http://xmnengjia.com/sdLamp/api/external';

  private username = process.env.NENGJIA_USERNAME || 'qlux';
  private password = process.env.NENGJIA_PASSWORD || '123456';

  private token: string | null = null;

  // =========================
  // 1. GET ACCESS TOKEN  
  // =========================
  async getAccessToken(): Promise<string> {
    try {
      const res = await axios.post(
        `${this.baseUrl}/accessToken`,
        new URLSearchParams({
          username: this.username,
          password: this.password,
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      );

      if (res.data.code !== 1000) {
        this.logger.error(`Failed to get token: ${res.data.msg || 'Unknown error'}`);
        throw new HttpException(
          res.data.msg || 'Failed to authenticate with Nengjia Cloud',
          HttpStatus.UNAUTHORIZED,
        );
      }

      this.token = res.data.data;

      this.logger.log('Token generated successfully');
      return this.token!;
    } catch (err) {
      this.logger.error('Error getting access token', err);
      if (err instanceof HttpException) {
        throw err;
      }
      throw new HttpException(
        'Error connecting to Nengjia Cloud authentication service',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // =========================
  // 2. GET VALID TOKEN
  // =========================
  async ensureToken(): Promise<string> {
    if (!this.token) {
      return this.getAccessToken();
    }
    return this.token;
  }

  // =========================
  // 3. DEVICE LIST
  // =========================
  async getDeviceList(pageNumber = 1, pageSize = 10) {
    try {
      const token = await this.ensureToken();

      const res = await axios.post(
        `${this.baseUrl}/deviceList`,
        new URLSearchParams({
          accessToken: token,
          pageNumber: String(pageNumber),
          pageSize: String(pageSize),
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      );

      if (res.data.code === 1003) {
        this.logger.warn('Token expired (code 1003). Retrying with a new token...');
        this.token = null;
        return this.getDeviceList(pageNumber, pageSize);
      }

      if (res.data.code !== 1000) {
        const message = res.data.msg || 'Failed to fetch device list';
        if (typeof message === 'string' && message.includes('请求限制')) {
          throw new HttpException(message, HttpStatus.TOO_MANY_REQUESTS);
        }
        throw new HttpException(message, HttpStatus.BAD_REQUEST);
      }

      return res.data.data;
    } catch (err) {
      this.logger.error('Error getting device list', err);
      if (err instanceof HttpException) {
        throw err;
      }
      throw new HttpException('Failed to connect to Nengjia Cloud', HttpStatus.BAD_GATEWAY);
    }
  }

  // =========================
  // 4. DEVICE STATUS
  // =========================
  async getDeviceStatus(serial: string) {
    try {
      const token = await this.ensureToken();

      const res = await axios.post(
        `${this.baseUrl}/deviceStatus`,
        new URLSearchParams({
          accessToken: token,
          serial,
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      );

      if (res.data.code === 1003) {
        this.logger.warn('Token expired (code 1003). Retrying with a new token...');
        this.token = null;
        return this.getDeviceStatus(serial);
      }

      if (res.data.code !== 1000) {
        throw new HttpException(res.data.msg || 'Failed to fetch device status', HttpStatus.BAD_REQUEST);
      }

      return res.data.data;
    } catch (err) {
      this.logger.error(`Error getting status for device ${serial}`, err);
      if (err instanceof HttpException) {
        throw err;
      }
      throw new HttpException('Failed to connect to Nengjia Cloud', HttpStatus.BAD_GATEWAY);
    }
  }

  // =========================
  // 5. CONTROL DEVICE (LIGHT)
  // =========================
  async adjustLight(serial: string, style: LightAction, power?: number, power2?: number) {
    try {
      const token = await this.ensureToken();

      const body: any = {
        accessToken: token,
        serial,
        style: String(style).toLowerCase(),
      };

      if (power !== undefined) {
        body.power = String(power);
      }
      
      // Dual-channel support for NEMA controllers based on the official docs
      if (power2 !== undefined) {
        body.power2 = String(power2);
      }

      // Hidden payload support based on the internal dashboard
      // The Nengjia server might dynamically pass unrecognized parameters directly to the hardware
      if (power !== undefined) {
        body.state1 = String(power);
        body.state2 = String(power2 !== undefined ? power2 : power);
        body.state3 = String(power2 !== undefined ? power2 : power);
      }

      const res = await axios.post(
        `${this.baseUrl}/adjustLight`,
        new URLSearchParams(body),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      );

      if (res.data.code === 1003) {
        this.logger.warn('Token expired (code 1003). Retrying with a new token...');
        this.token = null;
        return this.adjustLight(serial, style, power);
      }

      if (res.data.code !== 1001 && res.data.code !== 1000) {
        throw new HttpException(res.data.msg || 'Failed to control light', HttpStatus.BAD_REQUEST);
      }

      return res.data;
    } catch (err) {
      this.logger.error(`Error controlling device ${serial}`, err);
      if (err instanceof HttpException) {
        throw err;
      }
      throw new HttpException('Failed to connect to Nengjia Cloud', HttpStatus.BAD_GATEWAY);
    }
  }

  // =========================
  // 6. ADD DEVICE
  // =========================
  async addDevice(serial: string) {
    try {
      const token = await this.ensureToken();
      const res = await axios.post(
        `${this.baseUrl}/addDevice`,
        new URLSearchParams({ accessToken: token, serial }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );
      if (res.data.code === 1003) {
        this.token = null;
        return this.addDevice(serial);
      }
      if (res.data.code !== 1000) {
        throw new HttpException(res.data.msg || 'Failed to add device', HttpStatus.BAD_REQUEST);
      }
      return res.data;
    } catch (err) {
      this.logger.error(`Error adding device ${serial}`, err);
      if (err instanceof HttpException) throw err;
      throw new HttpException('Failed to connect to Nengjia Cloud', HttpStatus.BAD_GATEWAY);
    }
  }

  // =========================
  // 7. REMOVE DEVICE
  // =========================
  async removeDevice(serial: string) {
    try {
      const token = await this.ensureToken();
      const res = await axios.post(
        `${this.baseUrl}/delDevice`,
        new URLSearchParams({ accessToken: token, serial }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );
      if (res.data.code === 1003) {
        this.token = null;
        return this.removeDevice(serial);
      }
      if (res.data.code !== 1000) {
        throw new HttpException(res.data.msg || 'Failed to remove device', HttpStatus.BAD_REQUEST);
      }
      return res.data;
    } catch (err) {
      this.logger.error(`Error removing device ${serial}`, err);
      if (err instanceof HttpException) throw err;
      throw new HttpException('Failed to connect to Nengjia Cloud', HttpStatus.BAD_GATEWAY);
    }
  }

  // =========================
  // 8. UPDATE DEVICE STATUS
  // =========================
  async updateDeviceStatus(serial: string) {
    try {
      const token = await this.ensureToken();
      const res = await axios.post(
        `${this.baseUrl}/updateStatus`,
        new URLSearchParams({ accessToken: token, serial }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );
      if (res.data.code === 1003) {
        this.token = null;
        return this.updateDeviceStatus(serial);
      }
      if (res.data.code !== 1001 && res.data.code !== 1000) {
        throw new HttpException(res.data.msg || 'Failed to update device status', HttpStatus.BAD_REQUEST);
      }
      return res.data;
    } catch (err) {
      this.logger.error(`Error updating status for device ${serial}`, err);
      if (err instanceof HttpException) throw err;
      throw new HttpException('Failed to connect to Nengjia Cloud', HttpStatus.BAD_GATEWAY);
    }
  }

  // =========================
  // 9. UPDATE DEVICE PARAMS
  // =========================
  async updateDeviceParams(serial: string, params?: any) {
    try {
      const token = await this.ensureToken();
      const body: any = { accessToken: token, serial };
      if (params) {
        // If there are other generic parameters we want to pass
        Object.assign(body, params);
      }
      const res = await axios.post(
        `${this.baseUrl}/updateParams`,
        new URLSearchParams(body),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );
      if (res.data.code === 1003) {
        this.token = null;
        return this.updateDeviceParams(serial, params);
      }
      if (res.data.code !== 1001 && res.data.code !== 1000) {
        throw new HttpException(res.data.msg || 'Failed to update device params', HttpStatus.BAD_REQUEST);
      }
      return res.data;
    } catch (err) {
      this.logger.error(`Error updating params for device ${serial}`, err);
      if (err instanceof HttpException) throw err;
      throw new HttpException('Failed to connect to Nengjia Cloud', HttpStatus.BAD_GATEWAY);
    }
  }

  // =========================
  // 10. GET DEVICE PARAMS
  // =========================
  async getDeviceParams(serial: string) {
    try {
      const token = await this.ensureToken();
      const res = await axios.post(
        `${this.baseUrl}/getDeviceParams`,
        new URLSearchParams({ accessToken: token, serial }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );
      if (res.data.code === 1003) {
        this.token = null;
        return this.getDeviceParams(serial);
      }
      if (res.data.code !== 10000 && res.data.code !== 1000) {
        throw new HttpException(res.data.msg || 'Failed to get device params', HttpStatus.BAD_REQUEST);
      }
      return res.data;
    } catch (err) {
      this.logger.error(`Error getting params for device ${serial}`, err);
      if (err instanceof HttpException) throw err;
      throw new HttpException('Failed to connect to Nengjia Cloud', HttpStatus.BAD_GATEWAY);
    }
  }

  // =========================
  // 11. DISTRIBUTE SOLAR SCHEDULE (Push autonomous dim schedule to hardware)
  // rules: Array of { hours: number, brightness: number }
  // The solar controller counts hours from sunset automatically.
  // =========================
  async distributeSolarSchedule(serial: string, rules: { hours: number; brightness: number }[]) {
    try {
      const token = await this.ensureToken();

      // Map rules to Nengjia format: { h: hours, s: minutes, d: brightness }
      // We set s (minutes) to 0, since our frontend rules operate in whole hours.
      // The API documentation expects 'd' (brightness) to be a string (e.g., "100")
      const timeBrightness = rules.map(r => ({ h: r.hours, s: 0, d: String(r.brightness) }));

      const body: any = {
        accessToken: token,
        serial,
        producer: '2',
        workPattern: '0', // Normal mode: uses timeBrightness phases
        timeBrightness: JSON.stringify(timeBrightness),
      };

      const res = await axios.post(
        `${this.baseUrl}/distributeParam`,
        new URLSearchParams(body),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      );

      if (res.data.code === 1003) {
        this.token = null;
        return this.distributeSolarSchedule(serial, rules);
      }

      if (res.data.code !== 1001 && res.data.code !== 1000) {
        throw new HttpException(res.data.msg || 'Failed to distribute Solar schedule', HttpStatus.BAD_REQUEST);
      }

      this.logger.log(`[SOLAR] Pushed schedule to hardware for device ${serial}`);
      return res.data;
    } catch (err) {
      this.logger.error(`Error distributing Solar schedule for ${serial}`, err);
      if (err instanceof HttpException) throw err;
      throw new HttpException('Failed to connect to Nengjia Cloud', HttpStatus.BAD_GATEWAY);
    }
  }

  // =========================
  // 12. DISTRIBUTE LED SCHEDULE (Push time-based schedule to hardware)
  // rules: Array of { time: string, action: 'ON'|'OFF'|'DIM', brightness: number }
  // The LED controller has an internal clock and will execute these autonomously.
  // =========================
  async distributeLedSchedule(serial: string, rules: { time: string; action: string; brightness?: number }[]) {
    try {
      const token = await this.ensureToken();

      // Map rules to Nengjia param format. Max 6 time points.
      const param = rules.slice(0, 6).map(r => {
        let state1 = 0; // OFF
        if (r.action === 'ON') state1 = 1;
        else if (r.action === 'DIM') state1 = 2;

        return {
          time: r.time,
          state1,
          state2: state1,
          brightness1: r.brightness ?? (r.action === 'ON' ? 100 : 0),
          brightness2: r.brightness ?? (r.action === 'ON' ? 100 : 0),
        };
      });

      const body: any = {
        accessToken: token,
        serial,
        param: JSON.stringify(param),
      };

      const res = await axios.post(
        `${this.baseUrl}/distributeParam`,
        new URLSearchParams(body),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      );

      if (res.data.code === 1003) {
        this.token = null;
        return this.distributeLedSchedule(serial, rules);
      }

      if (res.data.code !== 1001 && res.data.code !== 1000) {
        throw new HttpException(res.data.msg || 'Failed to distribute LED schedule', HttpStatus.BAD_REQUEST);
      }

      this.logger.log(`[LED] Pushed schedule to hardware for device ${serial}`);
      return res.data;
    } catch (err) {
      this.logger.error(`Error distributing LED schedule for ${serial}`, err);
      if (err instanceof HttpException) throw err;
      throw new HttpException('Failed to connect to Nengjia Cloud', HttpStatus.BAD_GATEWAY);
    }
  }
}

