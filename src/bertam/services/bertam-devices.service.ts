import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, Not } from 'typeorm';
import { BertamDevice } from '../entities/bertam-device.entity';
import { BertamTelemetryHistory } from '../entities/bertam-telemetry-history.entity';
import { BertamDailyStats } from '../entities/bertam-daily-stats.entity';

@Injectable()
export class BertamDevicesService {
  constructor(
    @InjectRepository(BertamDevice)
    private readonly deviceRepo: Repository<BertamDevice>,
    @InjectRepository(BertamTelemetryHistory)
    private readonly historyRepo: Repository<BertamTelemetryHistory>,
    @InjectRepository(BertamDailyStats)
    private readonly dailyStatsRepo: Repository<BertamDailyStats>,
  ) {}

  findAll(): Promise<BertamDevice[]> {
    return this.deviceRepo.find({
      where: { site_name: Not('Unassigned') },
      order: { created_datetime: 'DESC' }
    });
  }

  findOne(id: number): Promise<BertamDevice | null> {
    return this.deviceRepo.findOneBy({ id });
  }

  async update(id: number, data: Partial<BertamDevice>): Promise<BertamDevice | null> {
    const device = await this.findOne(id);
    if (!device) return null;
    const updated = this.deviceRepo.merge(device, data);
    return this.deviceRepo.save(updated);
  }

  async remove(id: number): Promise<void> {
    await this.deviceRepo.delete(id);
  }

  async getDashboardSummary(siteName?: string, startDate?: string, endDate?: string) {
    const whereClause: any = { site_name: Not('Unassigned') };
    if (siteName && siteName !== 'All') {
      whereClause.site_name = siteName;
    }
    
    const devices = await this.deviceRepo.find({ where: whereClause });
    const total = devices.length;
    const online = devices.filter(d => d.is_online === 1).length;
    const offline = total - online;
    const lowBattery = devices.filter(d => Number(d.battery_percent) <= 20).length;
    const lighting = devices.filter(d => Number(d.led_status) > 0).length;
    
    // Sum daily stats for devices in the requested site and date range
    let allStats: BertamDailyStats[] = [];
    if (startDate && endDate) {
      allStats = await this.dailyStatsRepo.find({ where: { date: Between(startDate, endDate) } });
    } else {
      allStats = await this.dailyStatsRepo.find();
    }
    
    // Filter stats to only include devices in the selected site
    const validEuis = new Set(devices.map(d => d.dev_eui));
    const stats = allStats.filter(s => validEuis.has(s.dev_eui));
    
    let totalEnergyKWh = 0;
    let totalMoneySavedRM = 0;
    let totalCo2PreventedKg = 0;
    
    stats.forEach(stat => {
      totalEnergyKWh += Number(stat.energyGeneratedKWh) || 0;
      totalMoneySavedRM += Number(stat.moneySavedRM) || 0;
      totalCo2PreventedKg += Number(stat.co2PreventedKg) || 0;
    });

    let weather: any = null;
    try {
      let lat = 5.5172; // Default Bertam Kepala Batas
      let lon = 100.4205;
      const deviceWithLoc = devices.find(d => d.latitude !== null && d.longitude !== null && !isNaN(Number(d.latitude)) && !isNaN(Number(d.longitude)));
      if (deviceWithLoc) {
        lat = Number(deviceWithLoc.latitude);
        lon = Number(deviceWithLoc.longitude);
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
      console.error('Failed to fetch weather data: ' + e.message);
    }

    return { 
      total, 
      online, 
      offline, 
      lowBattery, 
      lighting,
      totalEnergyKWh,
      totalMoneySavedRM,
      totalCo2PreventedKg,
      weather
    };
  }

  async getHistoricalGraphData(siteName?: string, startDate?: string, endDate?: string) {
    let allStats: BertamDailyStats[] = [];

    if (startDate && endDate) {
      allStats = await this.dailyStatsRepo.find({
        where: { date: Between(startDate, endDate) },
        order: { date: 'ASC' }
      });
    } else {
      allStats = await this.dailyStatsRepo.find({
        order: { date: 'ASC' }
      });
    }

    let stats = allStats;
    if (siteName && siteName !== 'All') {
      const devices = await this.deviceRepo.find({ where: { site_name: siteName } });
      const validEuis = new Set(devices.map(d => d.dev_eui));
      stats = allStats.filter(s => validEuis.has(s.dev_eui));
    }

    const labels = [...new Set(stats.map(s => s.date))].sort();
    
    const energyData = labels.map(date => {
      const dayStats = stats.filter(s => s.date === date);
      return dayStats.reduce((sum, stat) => sum + Number(stat.energyGeneratedKWh), 0);
    });

    return {
      labels,
      datasets: [
        {
          label: 'Green Energy (kWh)',
          data: energyData,
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          borderWidth: 2
        }
      ]
    };
  }

  async getHistoryByDeviceAndDate(devEui: string, date: string): Promise<BertamTelemetryHistory[]> {
    return this.historyRepo.find({
      where: {
        dev_eui: devEui,
        timestamp: Between(`${date}T00:00:00.000Z`, `${date}T23:59:59.999Z`),
      },
      order: { timestamp: 'ASC' },
    });
  }

  async getRecentHistory(devEui: string, limit = 48): Promise<BertamTelemetryHistory[]> {
    return this.historyRepo.find({
      where: { dev_eui: devEui },
      order: { created_datetime: 'DESC' },
      take: limit,
    });
  }
}
