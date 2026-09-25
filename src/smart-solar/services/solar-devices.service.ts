import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { SolarDevice } from '../entities/solar-device.entity';
import { TelemetryHistory } from '../entities/telemetry-history.entity';
import { SolarDailyStats } from '../entities/solar-daily-stats.entity';
import { NengjiaService } from '../../nengjia/nengjia.service';

@Injectable()
export class SolarDevicesService {
  private readonly logger = new Logger(SolarDevicesService.name);

  constructor(
    @InjectRepository(SolarDevice)
    private repo: Repository<SolarDevice>,
    @InjectRepository(TelemetryHistory)
    private historyRepo: Repository<TelemetryHistory>,
    @InjectRepository(SolarDailyStats)
    private dailyStatsRepo: Repository<SolarDailyStats>,
    private readonly nengjiaService: NengjiaService,
  ) {}

  async create(data: Partial<SolarDevice>): Promise<SolarDevice> {
    // 1. Register with Nengjia Cloud first
    if (data.serial) {
      try {
        await this.nengjiaService.addDevice(data.serial);
        this.logger.log(`Device ${data.serial} added to Nengjia Cloud`);
      } catch (err: any) {
        this.logger.error(`Notice from Nengjia Cloud for ${data.serial}: ${err.message}`);
        throw err;
      }
    }

    // 2. Save locally
    const newDevice = this.repo.create(data);
    return this.repo.save(newDevice);
  }

  findAll(projectId?: number): Promise<SolarDevice[]> {
    const where: any = {};
    if (projectId) where.project = { id: projectId };
    return this.repo.find({ 
      where, 
      order: { created_datetime: 'DESC' },
      relations: { project: true, schedule_profile: true }
    });
  }

  findOne(id: number): Promise<SolarDevice | null> {
    return this.repo.findOneBy({ id });
  }

  async update(id: number, data: Partial<SolarDevice>): Promise<SolarDevice | null> {
    const device = await this.findOne(id);
    if (!device) return null;
    
    // Handle project unassignment explicitly since TypeORM merge ignores null for relations
    if ('project' in data) {
      device.project = data.project as any;
    }

    // Merge remaining data
    const updatedDevice = this.repo.merge(device, data);
    return this.repo.save(updatedDevice);
  }

  async remove(id: number): Promise<void> {
    const device = await this.findOne(id);
    if (!device) throw new Error('Device not found');

    // 1. Unbind from Nengjia Cloud first
    if (device.serial) {
      try {
        await this.nengjiaService.removeDevice(device.serial);
        this.logger.log(`Device ${device.serial} removed from Nengjia Cloud`);
      } catch (err) {
        this.logger.error(`Failed to remove device ${device.serial} from Nengjia`, err);
        throw err;
      }
    }

    // 2. Remove locally
    await this.repo.delete(id);
  }

  async bindGateway(deviceSerial: string, gatewaySerial: string, action: 'add' | 'del' = 'add'): Promise<void> {
    const device = await this.repo.findOneBy({ serial: deviceSerial });
    if (!device) {
      throw new Error(`Device ${deviceSerial} not found`);
    }

    // Business Rule: Only ZhagaLora devices can be bound to gateways
    if (device.device_type?.toLowerCase() !== 'zhagalora') {
      throw new Error(`Only ZhagaLora devices can be bound to a gateway. Device ${deviceSerial} is a ${device.device_type}`);
    }

    // Since Nengjia doesn't have a gateway binding API yet, we just handle it locally
    device.gateway_serial = action === 'add' ? gatewaySerial : null;
    await this.repo.save(device);
    
    this.logger.log(`[Local] Successfully ${action === 'add' ? 'bound' : 'unbound'} Solar device ${deviceSerial} to gateway ${gatewaySerial}`);
  }

  async getDashboardSummary(projectId?: number, startDate?: string, endDate?: string) {
    const TNB_TARIFF_RM_PER_KWH = 0.192;
    const CO2_KG_PER_KWH = 0.65;

    // Get basic stats from devices
    const where: any = {};
    if (projectId) where.project = { id: projectId };
    let devices = await this.repo.find({ where });
    devices = devices.filter(d => d.device_type !== 'Gateway');
    
    // Sum from daily stats
    const statsWhere: any = {};
    if (projectId) statsWhere.projectId = projectId;
    if (startDate && endDate) {
      statsWhere.date = Between(startDate, endDate);
    }
    const allStats = await this.dailyStatsRepo.find({ where: statsWhere });
    
    const totalGreenEnergyKWh = allStats.reduce((sum, s) => sum + Number(s.energyGeneratedKWh), 0);
    const moneySavedRM = totalGreenEnergyKWh * TNB_TARIFF_RM_PER_KWH;
    const co2PreventedKg = totalGreenEnergyKWh * CO2_KG_PER_KWH;

    let weather: any = null;
    try {
      let lat = 3.1390; // Default KL
      let lon = 101.6869;
      const deviceWithLoc = devices.find(d => d.latitude !== null && d.longitude !== null && !isNaN(d.latitude) && !isNaN(d.longitude));
      if (deviceWithLoc) {
        lat = deviceWithLoc.latitude;
        lon = deviceWithLoc.longitude;
      }
      const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto`);
      if (response.ok) {
        const data = await response.json();
        const current = data.current;
        const code = current.weather_code;
        let desc = 'Unknown';
        let icon = 'cloud';
        if (code === 0) { desc = 'Clear Sky'; icon = 'light_mode'; }
        else if (code >= 1 && code <= 3) { desc = 'Partly Cloudy'; icon = 'partly_cloudy_day'; }
        else if (code === 45 || code === 48) { desc = 'Foggy'; icon = 'foggy'; }
        else if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) { desc = 'Rainy'; icon = 'rainy'; }
        else if ((code >= 71 && code <= 77) || code === 85 || code === 86) { desc = 'Snowy'; icon = 'ac_unit'; }
        else if (code >= 95) { desc = 'Thunderstorm'; icon = 'thunderstorm'; }

        weather = {
          temp: current.temperature_2m,
          humidity: current.relative_humidity_2m,
          windSpeed: current.wind_speed_10m,
          desc,
          icon
        };
      }
    } catch (e) {
      this.logger.error('Failed to fetch weather data: ' + e.message);
    }

    return {
      total: devices.length,
      online: devices.filter(d => d.is_online === 1).length,
      offline: devices.filter(d => d.is_online === 0).length,
      lowBattery: devices.filter(d => d.battery_percent !== null && d.battery_percent < 20).length,
      totalGreenEnergyKWh,
      moneySavedRM,
      co2PreventedKg,
      weather,
    };
  }

  async getHistoricalGraphData(projectId?: number, startDate?: string, endDate?: string) {
    const TNB_TARIFF_RM_PER_KWH = 0.192;
    const CO2_KG_PER_KWH = 0.65;
    
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
        acc[curr.date] = { energyGeneratedKWh: 0, moneySavedRM: 0, co2PreventedKg: 0 };
      }
      acc[curr.date].energyGeneratedKWh += Number(curr.energyGeneratedKWh);
      acc[curr.date].moneySavedRM += Number(curr.moneySavedRM);
      acc[curr.date].co2PreventedKg += Number(curr.co2PreventedKg);
      return acc;
    }, {} as Record<string, any>);

    return Object.keys(grouped).map(date => ({
      date,
      ...grouped[date]
    }));
  }

  async resetDashboardStats(projectId?: number) {
    if (projectId) {
      await this.dailyStatsRepo.delete({ projectId });
      this.logger.log(`Reset all daily stats for solar project ${projectId}`);
    } else {
      await this.dailyStatsRepo.clear();
      this.logger.log(`Reset all daily stats for all solar projects`);
    }
  }


  async getSolarMonitoring(projectId?: number): Promise<SolarDevice[]> {
    // 100% Local DB - The cron job fetches all deep telemetry every minute and saves it.
    // This strictly prevents "24-hour rate limit" errors from the Nengjia Cloud when the user refreshes the page.
    const where: any = {};
    if (projectId) where.project = { id: projectId };

    return this.repo.find({ 
      where,
      order: { updated_datetime: 'DESC' },
      relations: { schedule_profile: true, project: true }
    });
  }

  async syncDeviceTelemetry(serial: string): Promise<SolarDevice> {
    const device = await this.repo.findOneBy({ serial });
    if (!device) throw new Error('Device not found in local database');

    try {
      // 1. Force the physical device to push fresh data to Nengjia Cloud
      try {
        await this.nengjiaService.updateDeviceStatus(serial);
      } catch (e) {
        this.logger.warn(`Could not force update status for ${serial}, proceeding with fetch anyway.`);
      }

      // 2. Fetch the latest available basic status (for online/offline)
      const listRes = await this.nengjiaService.getDeviceList(1, 1000);
      const cloudList = listRes.list || [];
      const cloudBasic = cloudList.find((c: any) => c.serial === serial);
      if (cloudBasic) {
        device.is_online = cloudBasic.is_online;
        device.signal_strength = cloudBasic.signal_strength;
      }

      // 3. Fetch deep telemetry (battery, solar power, etc.)
      const statusRes = await this.nengjiaService.getDeviceStatus(serial);
      const telemetry = statusRes.data ? statusRes.data : statusRes;

      if (telemetry) {
        // Calculate added charge for daily stats
        const oldCharge = Number(device.charge_capacity) || 0;
        const newCharge = Number(telemetry.charge_capacity) || 0;
        const addedChargeWh = newCharge > oldCharge ? newCharge - oldCharge : 0;
        const addedChargeKWh = addedChargeWh / 1000;

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

        // Save manual sync to history table so graphs get it immediately
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
            
            // Ensure project ID is up to date in case it was moved
            if (device.project) {
               dailyStat.projectId = device.project.id;
            }
          }
          await this.dailyStatsRepo.save(dailyStat);
        }
      }

      // 4. Save to local DB and return updated device
      device.updated_datetime = new Date();
      await this.repo.save(device);
      this.logger.log(`On-demand telemetry sync successful for ${serial}`);
      return device;

    } catch (err: any) {
      this.logger.error(`Failed to sync telemetry for ${serial}`, err);
      throw new Error(err.message || 'Failed to sync with Nengjia Cloud');
    }
  }

  async executeAction(serial: string, action: string, power?: number): Promise<void> {
    try {
      // Explicitly set power to 100% when turning ON if not provided.
      // Many nodes will energize the relay but leave the dimming at 0%, resulting in no light.
      if (action === 'ON' && power === undefined) {
        power = 100;
      }
      // action is expected to be 'ON', 'OFF', or 'DIM'
      await this.nengjiaService.adjustLight(serial, action as any, power);
      this.logger.log(`Successfully executed ${action} for Solar Device ${serial}`);
    } catch (error) {
      this.logger.error(`Failed to execute ${action} for Solar Device ${serial}: ${error.message}`);
      throw error;
    }
  }
}
