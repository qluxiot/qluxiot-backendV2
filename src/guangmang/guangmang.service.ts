import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class GuangmangService {
  private readonly logger = new Logger(GuangmangService.name);

  private baseUrl = process.env.GUANGMANG_BASE_URL || 'https://gm.xmnengjia.com';

  private username = process.env.GUANGMANG_USERNAME || 'qlux';
  private password = process.env.GUANGMANG_PASSWORD || '123456';

  private token: string | null = null;
  private tokenExpiresAt: number = 0;
  private cachedWorkId: string | null = process.env.GUANGMANG_WORK_ID || 'beb9cb12f15a4720980e110f6c3a1713';

  // =========================
  // 1. GET ACCESS TOKEN  
  // =========================
  async getAccessToken(): Promise<string> {
    try {
      const timestamp = new Date().getTime();
      // Format: Base64(username:Base64(password + timestamp))
      const passTimeBase64 = Buffer.from(this.password + timestamp).toString('base64');
      const authHeader = 'Basic ' + Buffer.from(this.username + ':' + passTimeBase64).toString('base64');

      const res = await axios.post(
        `${this.baseUrl}/admin/api/oauth/v1/getToken`,
        {},
        {
          headers: {
            'Authorization': authHeader,
          },
        },
      );

      if (res.data.code !== 0) {
        this.logger.error(`Failed to get token: ${res.data.msg || 'Unknown error'}`);
        throw new HttpException(
          res.data.msg || 'Failed to authenticate with Guangmang Cloud',
          HttpStatus.UNAUTHORIZED,
        );
      }

      // Keep the "Bearer " prefix as it is required for the Authorization header
      this.token = res.data.data;

      // Validity is 30 Days
      this.tokenExpiresAt = Date.now() + 29 * 24 * 60 * 60 * 1000;

      this.logger.log('Guangmang Token generated successfully');
      return this.token!;
    } catch (err) {
      this.logger.error('Error getting access token: ' + (err.response?.data?.msg || err.message));
      if (err instanceof HttpException) {
        throw err;
      }
      throw new HttpException(
        err.response?.data?.msg || 'Error connecting to Guangmang Cloud authentication service',
        err.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // =========================
  // 2. GET VALID TOKEN
  // =========================
  async ensureToken(): Promise<string> {
    if (!this.token || Date.now() > this.tokenExpiresAt) {
      return this.getAccessToken();
    }
    return this.token;
  }

  // =========================
  // 2. GET WORK ID (Project ID)
  // =========================
  async getWorkId(): Promise<string> {
    if (this.cachedWorkId) return this.cachedWorkId;
    
    // Fetch from device list as a reliable way to get the assigned project ID
    try {
      const devices = await this.getDeviceList(1, 1);
      if (devices && devices.length > 0 && devices[0].workId) {
        this.cachedWorkId = devices[0].workId;
        return this.cachedWorkId as string;
      }
    } catch (e) {
      this.logger.warn('Could not fetch workId from device list, falling back to empty string');
    }
    return '';
  }

  // =========================
  // 3. DEVICE LIST
  // =========================
  async getDeviceList(page = 1, size = 50) {
    try {
      const token = await this.ensureToken();

      const res = await axios.post(
        `${this.baseUrl}/lightpole/api/dSingleLamps?page=${page}&size=${size}`,
        {},
        {
          headers: {
            'Authorization': token,
            'workid': await this.getWorkId()
          },
        },
      );

      if (res.data.code !== 0) {
        if (res.data.code === 10000 || res.data.code === 1001) {
             // Maybe token expired, clear it
             this.token = null;
        }
        throw new HttpException(res.data.msg || 'Failed to fetch device list', HttpStatus.BAD_REQUEST);
      }

      // The Guangmang API returns data inside a nested "data" property array
      if (res.data.data && Array.isArray(res.data.data.data)) {
        return res.data.data.data;
      }
      return [];
    } catch (err) {
      this.logger.error('Error getting device list', err);
      if (err instanceof HttpException) throw err;
      throw new HttpException('Failed to connect to Guangmang Cloud', HttpStatus.BAD_GATEWAY);
    }
  }

  // =========================
  // 4. DEVICE STATUS READING (force poll)
  // =========================
  async forcePollDeviceStatus(equipmentId: string) {
    try {
      const token = await this.ensureToken();

      const res = await axios.post(
        `${this.baseUrl}/lightpole/api/dSingleLamps/dataPollReq`,
        { equipmentId },
        {
          headers: {
            'Authorization': token,
            'Content-Type': 'application/json',
          },
        },
      );

      if (res.data.code !== 0) {
        this.logger.warn(`Data poll request failed for ${equipmentId}: ${res.data.msg}`);
      }

      return res.data;
    } catch (err) {
      this.logger.error(`Error forcing data poll for device ${equipmentId}`, err);
    }
  }

  // =========================
  // 5. CONTROL DEVICE (LIGHT DIMMING)
  // =========================
  async adjustLight(equipmentId: string, power: number | string, power2?: number | string, power3?: number | string) {
    try {
      const token = await this.ensureToken();

      // Ensure they are sent as strict Integers (Guangmang API requires integers, not strings)
      const p1 = parseInt(String(power), 10);
      const p2 = power2 !== undefined ? parseInt(String(power2), 10) : p1;
      const p3 = power3 !== undefined ? parseInt(String(power3), 10) : p1;

      const body: any = {
        equipmentId,
        state1: p1,
        state2: p2,
        state3: p3,
      };

      const res = await axios.post(
        `${this.baseUrl}/lightpole/api/dSingleLamps/switchReq`,
        body,
        {
          headers: {
            'Authorization': token,
            'Content-Type': 'application/json',
          },
        },
      );

      if (res.data.code !== 0) {
        throw new HttpException(res.data.msg || 'Failed to control light', HttpStatus.BAD_REQUEST);
      }

      return res.data;
    } catch (err) {
      this.logger.error(`Error controlling device ${equipmentId}`, err);
      if (err instanceof HttpException) throw err;
      throw new HttpException('Failed to connect to Guangmang Cloud', HttpStatus.BAD_GATEWAY);
    }
  }

  // =========================
  // 6. ADD STREET LIGHT ASSET
  // =========================
  async addStreetLight(equipmentName: string, equipmentNum: string) {
    try {
      const token = await this.ensureToken();
      const workId = await this.getWorkId();

      const res = await axios.post(
        `${this.baseUrl}/asset/api/tSingleLamps`,
        { equipmentName, equipmentNum },
        {
          headers: {
            'Authorization': token,
            'workid': workId,
            'Content-Type': 'application/json',
          },
        },
      );

      if (res.data.code !== 0) {
        // If the device is already registered, Guangmang returns '序列号重复' (Serial number duplicate)
        if (res.data.msg && res.data.msg.includes('重复')) {
          this.logger.log(`[GM] Street light "${equipmentName}" (${equipmentNum}) already exists in Guangmang Cloud. Ignoring duplicate error.`);
          return null; // Treat as success
        }
        throw new HttpException(res.data.msg || 'Failed to add street light to Guangmang Cloud', HttpStatus.BAD_REQUEST);
      }

      this.logger.log(`[GM] Added street light "${equipmentName}" (${equipmentNum}) to Guangmang Cloud`);
      return res.data.data;
    } catch (err) {
      this.logger.error(`Error adding street light ${equipmentNum} to Guangmang Cloud`, err);
      if (err instanceof HttpException) throw err;
      throw new HttpException('Failed to connect to Guangmang Cloud', HttpStatus.BAD_GATEWAY);
    }
  }

  // =========================
  // 7. DELETE STREET LIGHT ASSET
  // =========================
  async deleteStreetLight(equipmentId: string) {
    try {
      const token = await this.ensureToken();

      const res = await axios.delete(
        `${this.baseUrl}/asset/api/tSingleLamps/${equipmentId}`,
        {
          headers: {
            'Authorization': token,
            'workid': await this.getWorkId()
          },
        },
      );

      if (res.data.code !== 0) {
        throw new HttpException(res.data.msg || 'Failed to delete street light from Guangmang Cloud', HttpStatus.BAD_REQUEST);
      }

      this.logger.log(`[GM] Deleted street light ${equipmentId} from Guangmang Cloud`);
      return res.data;
    } catch (err) {
      this.logger.error(`Error deleting street light ${equipmentId} from Guangmang Cloud`, err);
      if (err instanceof HttpException) throw err;
      throw new HttpException('Failed to connect to Guangmang Cloud', HttpStatus.BAD_GATEWAY);
    }
  }

  // =========================
  // 8. ADD GATEWAY ASSET
  // =========================
  async addGateway(equipmentName: string, equipmentNum: string) {
    try {
      const token = await this.ensureToken();
      const workId = await this.getWorkId();

      const res = await axios.post(
        `${this.baseUrl}/asset/api/tGateways`,
        { equipmentName, equipmentNum },
        {
          headers: {
            'Authorization': token,
            'workid': workId,
            'Content-Type': 'application/json',
          },
        },
      );

      if (res.data.code !== 0) {
        // If the device is already registered, Guangmang returns '序列号重复' (Serial number duplicate)
        if (res.data.msg && res.data.msg.includes('重复')) {
          this.logger.log(`[GM] Gateway "${equipmentName}" (${equipmentNum}) already exists in Guangmang Cloud. Ignoring duplicate error.`);
          return null; // Treat as success
        }
        throw new HttpException(res.data.msg || 'Failed to add gateway to Guangmang Cloud', HttpStatus.BAD_REQUEST);
      }

      this.logger.log(`[GM] Added gateway "${equipmentName}" (${equipmentNum}) to Guangmang Cloud`);
      return res.data.data;
    } catch (err) {
      this.logger.error(`Error adding gateway ${equipmentNum} to Guangmang Cloud`, err);
      if (err instanceof HttpException) throw err;
      throw new HttpException('Failed to connect to Guangmang Cloud', HttpStatus.BAD_GATEWAY);
    }
  }

  // =========================
  // 9. DELETE GATEWAY ASSET
  // =========================
  async deleteGateway(equipmentId: string) {
    try {
      const token = await this.ensureToken();

      const res = await axios.delete(
        `${this.baseUrl}/asset/api/tGateways/${equipmentId}`,
        {
          headers: {
            'Authorization': token,
            'workid': await this.getWorkId()
          },
        },
      );

      if (res.data.code !== 0) {
        throw new HttpException(res.data.msg || 'Failed to delete gateway from Guangmang Cloud', HttpStatus.BAD_REQUEST);
      }

      this.logger.log(`[GM] Deleted gateway ${equipmentId} from Guangmang Cloud`);
      return res.data;
    } catch (err) {
      this.logger.error(`Error deleting gateway ${equipmentId} from Guangmang Cloud`, err);
      if (err instanceof HttpException) throw err;
      throw new HttpException('Failed to connect to Guangmang Cloud', HttpStatus.BAD_GATEWAY);
    }
  }

  // =========================
  // 10. BIND GATEWAY TO DEVICES (LoRaWAN)
  // type: 'add' = Bind, 'del' = Unbind
  // =========================
  async bindGateway(gatewayId: string, equipmentIds: string, type: 'add' | 'del' = 'add') {
    try {
      const token = await this.ensureToken();

      const res = await axios.post(
        `${this.baseUrl}/lightpole/api/dGateways/processGatewayBinding`,
        { gatewayId, equipmentIds, type },
        {
          headers: {
            'Authorization': token,
            'Content-Type': 'application/json',
          },
        },
      );

      if (res.data.code !== 0) {
        throw new HttpException(res.data.msg || 'Failed to bind gateway', HttpStatus.BAD_REQUEST);
      }

      this.logger.log(`[GM] Gateway ${gatewayId} ${type === 'add' ? 'bound to' : 'unbound from'} devices: ${equipmentIds}`);
      return res.data;
    } catch (err) {
      this.logger.error(`Error binding gateway ${gatewayId}`, err);
      if (err instanceof HttpException) throw err;
      throw new HttpException('Failed to connect to Guangmang Cloud', HttpStatus.BAD_GATEWAY);
    }
  }

  // =========================
  // 11. GET GATEWAY LIST (with isOnline status)
  // =========================
  async getGatewayList(page = 1, size = 50) {
    try {
      const token = await this.ensureToken();

      const res = await axios.post(
        `${this.baseUrl}/lightpole/api/dGateways?page=${page}&size=${size}`,
        {},
        {
          headers: {
            'Authorization': token,
            'Content-Type': 'application/json',
          },
        },
      );

      if (res.data.code !== 0) {
        throw new HttpException(res.data.msg || 'Failed to fetch gateway list', HttpStatus.BAD_REQUEST);
      }

      if (res.data.data && Array.isArray(res.data.data.data)) {
        return res.data.data.data;
      }
      return [];
    } catch (err) {
      this.logger.error('Error getting gateway list', err);
      if (err instanceof HttpException) throw err;
      throw new HttpException('Failed to connect to Guangmang Cloud', HttpStatus.BAD_GATEWAY);
    }
  }

  // =========================
  // 12. DISTRIBUTE LED SCHEDULE
  // =========================
  async distributeLedSchedule(equipmentId: string, rules: { time: string; action: string; brightness?: number }[]) {
    try {
      const token = await this.ensureToken();

      const timeBrightness = rules.slice(0, 6).map(r => {
        const dimVal = r.action === 'ON' ? (r.brightness ?? 100) : (r.action === 'OFF' ? 0 : (r.brightness ?? 0));
        return {
          time: r.time,
          dimmers: [dimVal, dimVal, dimVal],
        };
      });

      const body = {
        equipmentId,
        timeBrightness: JSON.stringify(timeBrightness),
      };

      const res = await axios.post(
        `${this.baseUrl}/lightpole/api/dSingleLamps/paramsSetReq`,
        body,
        {
          headers: {
            'Authorization': token,
            'Content-Type': 'application/json',
          },
        },
      );

      if (res.data.code !== 0) {
        throw new HttpException(res.data.msg || 'Failed to distribute LED schedule', HttpStatus.BAD_REQUEST);
      }

      this.logger.log(`[LED] Pushed schedule to hardware for device ${equipmentId}`);
      return res.data;
    } catch (err) {
      this.logger.error(`Error distributing LED schedule for ${equipmentId}`, err);
      if (err instanceof HttpException) throw err;
      throw new HttpException('Failed to connect to Guangmang Cloud', HttpStatus.BAD_GATEWAY);
    }
  }

  async getAssetGateways(page = 1, size = 1000) {
    try {
      const token = await this.ensureToken();
      const res = await axios.get(
        `${this.baseUrl}/asset/api/tGateways?page=${page}&size=${size}`,
        { headers: { 'Authorization': token, 'Content-Type': 'application/json' } }
      );
      if (res.data.data && Array.isArray(res.data.data.data)) return res.data.data.data;
      return [];
    } catch (err) { return []; }
  }

  async getAssetDevices(page = 1, size = 1000) {
    try {
      const token = await this.ensureToken();
      const res = await axios.get(
        `${this.baseUrl}/asset/api/tSingleLamps?page=${page}&size=${size}`,
        { headers: { 'Authorization': token, 'Content-Type': 'application/json' } }
      );
      if (res.data.data && Array.isArray(res.data.data.data)) return res.data.data.data;
      return [];
    } catch (err) { return []; }
  }
}
