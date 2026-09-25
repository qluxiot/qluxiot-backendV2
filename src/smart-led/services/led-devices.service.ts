import { Injectable, Logger, NotFoundException, Inject, forwardRef, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { LedDevice } from '../entities/led-device.entity';
import { GuangmangService } from '../../guangmang/guangmang.service';
import { LedTelemetryHistoryService } from './led-telemetry-history.service';
import { LedDailyStats } from '../entities/led-daily-stats.entity';

@Injectable()
export class LedDevicesService {
  private readonly logger = new Logger(LedDevicesService.name);

  constructor(
    @InjectRepository(LedDevice)
    private readonly deviceRepository: Repository<LedDevice>,
    private readonly guangmangService: GuangmangService,
    @Inject(forwardRef(() => LedTelemetryHistoryService))
    private readonly historyService: LedTelemetryHistoryService,
    @InjectRepository(LedDailyStats)
    private dailyStatsRepo: Repository<LedDailyStats>,
  ) {}

  async findAll(projectId?: number): Promise<LedDevice[]> {
    const where: any = {};
    if (projectId) where.project = { id: projectId };

    return this.deviceRepository.find({ 
      where,
      order: { updated_at: 'DESC' },
      relations: { schedule_profile: true, project: true }
    });
  }

  async findOne(serial: string): Promise<LedDevice> {
    const device = await this.deviceRepository.findOne({ where: { serial } });
    if (!device) {
      throw new NotFoundException(`LED Device with serial ${serial} not found`);
    }
    return device;
  }

  async create(serial: string, name?: string, projectId?: number, deviceType?: string, status?: string, latitude?: number, longitude?: number): Promise<LedDevice> {
    const resolvedType = deviceType ?? 'Nema4G';
    let device = await this.deviceRepository.findOne({ where: { serial } });
    if (!device) {
      device = this.deviceRepository.create({ 
        serial, 
        name, 
        device_type: resolvedType, 
        status: status ?? 'Active',
        latitude: latitude ?? 0,
        longitude: longitude ?? 0
      });
    } else {
      if (name) device.name = name;
      if (deviceType) device.device_type = deviceType;
      if (status) device.status = status;
      if (latitude !== undefined) device.latitude = latitude;
      if (longitude !== undefined) device.longitude = longitude;
    }

    if (projectId !== undefined) {
      device.project = projectId ? { id: projectId } as any : null;
    }

    device.updated_at = new Date();
    await this.deviceRepository.save(device);

    // Register device in the correct Guangmang Cloud endpoint based on device type
    try {
      const typeLower = resolvedType.toLowerCase();
      if (typeLower === 'gateway') {
        // Gateway -> Guangmang Cloud Gateway API
        await this.guangmangService.addGateway(name ?? serial, serial);
        this.logger.log(`[Cloud] Registered Gateway ${serial} in Guangmang Cloud`);
      } else if (typeLower.startsWith('nema')) {
        // NEMA (4G or LoRa) -> Guangmang Cloud Street Light API
        await this.guangmangService.addStreetLight(name ?? serial, serial);
        this.logger.log(`[Cloud] Registered NEMA device ${serial} in Guangmang Cloud`);
      }
    } catch (error) {
      this.logger.warn(`Cloud registration failed for ${serial} (${resolvedType}): ${error.message}. Device saved locally.`);
    }

    // Attempt initial sync for non-gateway devices
    if (resolvedType !== 'Gateway') {
      try {
        await this.syncDeviceTelemetry(serial);
        const syncedDevice = await this.deviceRepository.findOne({ where: { serial } });
        if (syncedDevice) {
          device = syncedDevice;
        }
      } catch (error) {
        this.logger.warn(`Initial sync failed for ${serial}: ${error.message}`);
      }
    }

    return device;
  }

  async remove(serial: string): Promise<void> {
    const device = await this.findOne(serial);

    // De-register device from Guangmang Cloud
    try {
      const typeLower = device.device_type?.toLowerCase() || '';
      if (typeLower === 'gateway') {
        const gatewayList = await this.guangmangService.getAssetGateways(1, 1000);
        const cloudGateway = gatewayList.find((g: any) => g.equipmentNum === serial || g.equipmentId === serial);
        if (cloudGateway?.equipmentId) {
          await this.guangmangService.deleteGateway(cloudGateway.equipmentId);
          this.logger.log(`[Cloud] Deleted Gateway ${serial} from Guangmang Cloud`);
        } else {
          this.logger.warn(`[Cloud] Gateway ${serial} not found in Guangmang Assets for deletion`);
        }
      } else if (typeLower.startsWith('nema')) {
        const cloudList = await this.guangmangService.getAssetDevices(1, 1000);
        const cloudDevice = cloudList.find((c: any) => c.equipmentNum === serial || c.equipmentId === serial);
        if (cloudDevice?.equipmentId) {
          await this.guangmangService.deleteStreetLight(cloudDevice.equipmentId);
          this.logger.log(`[Cloud] Deleted NEMA ${serial} from Guangmang Cloud`);
        } else {
          this.logger.warn(`[Cloud] NEMA ${serial} not found in Guangmang Assets for deletion`);
        }
      }
    } catch (error) {
      this.logger.error(`Failed to remove device ${serial} from cloud`, error);
    }

    // Remove from local database
    await this.deviceRepository.remove(device);
  }

  async resetDashboardStats(projectId?: number) {
    if (projectId) {
      await this.dailyStatsRepo.delete({ projectId });
      this.logger.log(`Reset all daily stats for LED project ${projectId}`);
    } else {
      await this.dailyStatsRepo.clear();
      this.logger.log(`Reset all daily stats for all LED projects`);
    }
  }

  async getDashboardSummary(projectId?: number, startDate?: string, endDate?: string) {
    let devices = await this.findAll(projectId);
    devices = devices.filter(d => d.device_type !== 'Gateway');

    const totalDevices = devices.length;
    const onlineDevices = devices.filter(d => d.is_online === 1).length;
    const activeLights = devices.filter(d => 
      d.is_online === 1 && 
      (d.is_lighting === 1 || Number(d.active_power) > 5 || Number(d.current) > 0.05)
    ).length;

    const statsWhere: any = {};
    if (projectId) statsWhere.projectId = projectId;
    if (startDate && endDate) {
      statsWhere.date = Between(startDate, endDate);
    }
    const allStats = await this.dailyStatsRepo.find({ where: statsWhere });

    const totalPowerConsumption = allStats.reduce((sum, s) => sum + (Number(s.powerConsumptionKWh) || 0), 0);
    const estimatedCostRM = allStats.reduce((sum, s) => sum + (Number(s.estimatedCostRM) || 0), 0);
    const energySavedKWh = allStats.reduce((sum, s) => sum + (Number(s.energySavedKWh) || 0), 0);
    const costSavedRM = allStats.reduce((sum, s) => sum + (Number(s.costSavedRM) || 0), 0);
    const co2PreventedKg = allStats.reduce((sum, s) => sum + (Number(s.co2PreventedKg) || 0), 0);

    return {
      totalDevices,
      onlineDevices,
      activeLights,
      totalPowerConsumption,
      estimatedCostRM,
      energySavedKWh,
      costSavedRM,
      co2PreventedKg,
    };
  }

  async getHistoricalGraphData(projectId?: number, startDate?: string, endDate?: string) {
    const where: any = {};
    if (projectId) where.projectId = projectId;
    if (startDate && endDate) {
      where.date = Between(startDate, endDate);
    }
    
    const stats = await this.dailyStatsRepo.find({ 
      where,
      order: { date: 'ASC' }
    });

    // We can group by date
    const grouped = stats.reduce((acc, curr) => {
      if (!acc[curr.date]) {
        acc[curr.date] = { powerConsumptionKWh: 0, estimatedCostRM: 0, energySavedKWh: 0, costSavedRM: 0, co2PreventedKg: 0 };
      }
      acc[curr.date].powerConsumptionKWh += (Number(curr.powerConsumptionKWh) || 0);
      acc[curr.date].estimatedCostRM += (Number(curr.estimatedCostRM) || 0);
      acc[curr.date].energySavedKWh += (Number(curr.energySavedKWh) || 0);
      acc[curr.date].costSavedRM += (Number(curr.costSavedRM) || 0);
      acc[curr.date].co2PreventedKg += (Number(curr.co2PreventedKg) || 0);
      return acc;
    }, {} as Record<string, any>);

    return Object.keys(grouped).map(date => ({
      date,
      ...grouped[date]
    }));
  }

  async bindGateway(deviceSerial: string, gatewaySerial: string, action: 'add' | 'del' = 'add'): Promise<void> {
    const device = await this.findOne(deviceSerial);

    // Business Rule: Only NemaLora devices can be bound to gateways
    if (device.device_type?.toLowerCase() !== 'nemalora') {
      throw new HttpException(`Only NemaLora devices can be bound to a gateway. Device ${deviceSerial} is a ${device.device_type}`, HttpStatus.BAD_REQUEST);
    }

    // Look up gateway in Guangmang Cloud
    const gatewayList = await this.guangmangService.getAssetGateways(1, 1000);
    const cloudGateway = gatewayList.find((g: any) => g.equipmentNum === gatewaySerial || g.equipmentId === gatewaySerial);
    if (!cloudGateway?.equipmentId) {
      throw new HttpException(`Gateway ${gatewaySerial} not found in Guangmang Cloud`, HttpStatus.NOT_FOUND);
    }

    // Look up device in Guangmang Cloud
    const deviceList = await this.guangmangService.getAssetDevices(1, 1000);
    const cloudDevice = deviceList.find((d: any) => d.equipmentNum === deviceSerial || d.equipmentId === deviceSerial);
    if (!cloudDevice?.equipmentId) {
      throw new HttpException(`Device ${deviceSerial} not found in Guangmang Cloud`, HttpStatus.NOT_FOUND);
    }

    // Bind on the cloud
    await this.guangmangService.bindGateway(cloudGateway.equipmentId, cloudDevice.equipmentId, action);

    // Update local database
    device.gateway_serial = action === 'add' ? gatewaySerial : null;
    await this.deviceRepository.save(device);
    
    this.logger.log(`[Cloud] Successfully ${action === 'add' ? 'bound' : 'unbound'} device ${deviceSerial} to gateway ${gatewaySerial}`);
  }

  async syncDeviceTelemetry(serial: string): Promise<LedDevice> {
    const device = await this.findOne(serial);
    
    try {
      this.logger.log(`Starting sync for LED device ${serial}...`);

      // === GATEWAY SYNC ===
      // Gateways use the separate Gateway List API - they don't have telemetry like street lights
      if (device.device_type?.toLowerCase() === 'gateway') {
        const gatewayList = await this.guangmangService.getGatewayList(1, 1000);
        const cloudGateway = gatewayList.find((g: any) => g.equipmentNum === serial || g.equipmentId === serial);

        if (!cloudGateway) {
          this.logger.warn(`Gateway ${serial} not found in Guangmang Cloud`);
          return device;
        }

        device.is_online = cloudGateway.isOnline === '1' || cloudGateway.isOnline === 1 || cloudGateway.status === 1 ? 1 : 0;
        device.signal_strength = cloudGateway.signalLevel ?? 0;
        
        if (cloudGateway.timeStamp) {
          device.timestamp = new Date(cloudGateway.timeStamp).getTime();
        } else if (cloudGateway.updateTime) {
          device.timestamp = new Date(cloudGateway.updateTime).getTime();
        } else {
          device.timestamp = Date.now();
        }

        device.updated_at = new Date();
        await this.deviceRepository.save(device);
        this.logger.log(`Successfully synced Gateway ${serial} (isOnline: ${device.is_online})`);
        return device;
      }

      // === STREET LIGHT SYNC ===
      // 1. Fetch the latest available status from the list API
      const cloudList = await this.guangmangService.getDeviceList(1, 1000);
      
      // Match by equipmentNum (user serial) or equipmentId (internal)
      const cloudBasic = cloudList.find((c: any) => c.equipmentNum === serial || c.equipmentId === serial);

      if (!cloudBasic) {
        this.logger.warn(`Device ${serial} not found in Guangmang Cloud (checked against equipmentNum and equipmentId)`);
        return device;
      }

      const equipmentId = cloudBasic.equipmentId;

      // 2. Force the physical device to push fresh data to Guangmang Cloud using internal equipmentId
      try {
        await this.guangmangService.forcePollDeviceStatus(equipmentId);
        this.logger.log(`Triggered data poll request for device ${equipmentId}`);
      } catch (e) {
        this.logger.warn(`Could not force update status for LED ${serial}, proceeding with fetch anyway.`);
      }

      device.is_online = cloudBasic.isOnline === '1' || cloudBasic.isOnline === 1 || cloudBasic.status === 'Y' ? 1 : 0;
      device.signal_strength = cloudBasic.signalLevel ?? 0;
      
      // Helper to parse pipe-separated values from the API (e.g. "240.83|240.83")
      const parsePipeValue = (val: any): any => {
        if (val === undefined || val === null) return null;
        const str = String(val).split('|')[0];
        const num = parseFloat(str);
        return isNaN(num) ? null : num;
      };

      // Deep telemetry mapping based on Guangmang API response format
      device.voltage = parsePipeValue(cloudBasic.volt);
      device.current = parsePipeValue(cloudBasic.amp);
      const parsedActivePower = parsePipeValue(cloudBasic.activePower);
      
      // Calculate cumulative energy (kWh)
      if (device.updated_at && parsedActivePower !== null) {
        const now = new Date();
        const elapsedHours = (now.getTime() - device.updated_at.getTime()) / (1000 * 60 * 60);
        const currentPowerInKW = parsedActivePower / 1000;
        
        // Only accumulate if the time gap is reasonable (e.g. <= 2 hours)
        // This prevents massive incorrect jumps if a device goes offline for a month.
        if (elapsedHours > 0 && elapsedHours <= 2) {
          const addedKWh = currentPowerInKW * elapsedHours;
          device.total_active_power = Number(device.total_active_power || 0) + addedKWh;
          
          // --- Update Daily Stats ---
          const today = new Date().toISOString().split('T')[0];
          let dailyStat = await this.dailyStatsRepo.findOne({
            where: { serial: device.serial, date: today }
          });
          
          const TNB_TARIFF_RM_PER_KWH = 0.192;
          const TRADITIONAL_TO_LED_SAVINGS_RATIO = 1.5;
          const CO2_KG_PER_KWH = 0.65;
          
          const estimatedCost = addedKWh * TNB_TARIFF_RM_PER_KWH;
          const energySaved = addedKWh * TRADITIONAL_TO_LED_SAVINGS_RATIO;
          const costSaved = energySaved * TNB_TARIFF_RM_PER_KWH;
          const co2Prevented = energySaved * CO2_KG_PER_KWH;

          if (!dailyStat) {
            dailyStat = this.dailyStatsRepo.create({
              serial: device.serial,
              projectId: device.project ? device.project.id : null,
              date: today,
              powerConsumptionKWh: addedKWh,
              estimatedCostRM: estimatedCost,
              energySavedKWh: energySaved,
              costSavedRM: costSaved,
              co2PreventedKg: co2Prevented
            });
          } else {
            dailyStat.powerConsumptionKWh = Number(dailyStat.powerConsumptionKWh) + addedKWh;
            dailyStat.estimatedCostRM = Number(dailyStat.estimatedCostRM) + estimatedCost;
            dailyStat.energySavedKWh = Number(dailyStat.energySavedKWh) + energySaved;
            dailyStat.costSavedRM = Number(dailyStat.costSavedRM) + costSaved;
            dailyStat.co2PreventedKg = Number(dailyStat.co2PreventedKg) + co2Prevented;
            
            if (device.project) {
              dailyStat.projectId = device.project.id;
            }
          }
          await this.dailyStatsRepo.save(dailyStat);
        }
      }

      device.active_power = parsedActivePower;
      // Map brightness from Guangmang's API (returns as 'dimmerValue', often separated by backticks if multiple heads e.g. "50`50")
      if (cloudBasic.dimmerValue !== undefined && cloudBasic.dimmerValue !== null) {
        const dimStr = String(cloudBasic.dimmerValue).split('`')[0]; // Take the first lamp head's dimming value
        const dimNum = parseInt(dimStr, 10);
        if (!isNaN(dimNum)) {
          device.brightness = dimNum;
        }
      } else if (cloudBasic.brightness !== undefined && cloudBasic.brightness !== null) {
        device.brightness = cloudBasic.brightness; // Fallback just in case
      }
      
      // Convert Guangmang's formatted date string into a bigint timestamp (milliseconds)
      if (cloudBasic.updateTime) {
        device.timestamp = new Date(cloudBasic.updateTime).getTime();
      } else {
        device.timestamp = Date.now();
      }

      // Guangmang streetlights return "isLighting": "[0,0]" or "[1,0]" instead of "isOpen"
      let isLighting = 0;
      if (cloudBasic.isLighting && String(cloudBasic.isLighting).includes('1')) {
        isLighting = 1;
      } else if (cloudBasic.activePower && parseFloat(String(cloudBasic.activePower)) > 0) {
        isLighting = 1; // Fallback: if drawing power, it's ON
      }
      device.is_lighting = isLighting;
      
      device.updated_at = new Date();
      await this.deviceRepository.save(device);
      
      // Save manual sync to history so it shows on graphs immediately
      if (this.historyService) {
        await this.historyService.logTelemetry(device);
      }
      
      this.logger.log(`Successfully synced LED device ${serial}`);
    } catch (error) {
      this.logger.error(`Failed to sync LED device ${serial}`, error.stack);
      throw error;
    }

    return device;
  }

  async executeAction(serial: string, action: string, power?: number): Promise<void> {
    try {
      this.logger.log(`Executing action ${action} for LED ${serial}...`);

      const cloudList = await this.guangmangService.getDeviceList(1, 1000);
      const cloudBasic = cloudList.find((c: any) => c.equipmentNum === serial || c.equipmentId === serial);

      if (!cloudBasic) {
        throw new Error(`Device ${serial} not found in Guangmang Cloud`);
      }

      const equipmentId = cloudBasic.equipmentId;

      if (action === 'ON' && power === undefined) {
        power = 100;
      } else if (action === 'OFF') {
        power = 0;
      }

      const finalPower = power ?? 100;
      
      // Send power to all three channels via the Guangmang switchReq API
      await this.guangmangService.adjustLight(equipmentId, finalPower);
      
      // OPTIMISTIC UPDATE: Update local database immediately to avoid API rate limits
      const device = await this.findOne(serial);
      device.is_lighting = finalPower > 0 ? 1 : 0;
      device.brightness = finalPower;
      device.updated_at = new Date();
      await this.deviceRepository.save(device);

      this.logger.log(`Successfully executed ${action} for LED ${serial} (Internal ID: ${equipmentId}) and updated local DB`);
    } catch (error) {
      this.logger.error(`Failed to execute ${action} for LED ${serial}: ${error.message}`);
      throw error;
    }
  }
}
