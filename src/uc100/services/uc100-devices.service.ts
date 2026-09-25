import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, IsNull } from 'typeorm';
import { Uc100Device } from '../entities/uc100-device.entity';
import { Uc100TelemetryHistory } from '../entities/uc100-telemetry-history.entity';
import { Uc100DailyStats } from '../entities/uc100-daily-stats.entity';
import { Uc100MqttService } from './uc100-mqtt.service';
import { Project } from '../../projects/entities/project.entity';

@Injectable()
export class Uc100DevicesService {
  constructor(
    @InjectRepository(Uc100Device)
    private readonly deviceRepo: Repository<Uc100Device>,
    @InjectRepository(Uc100TelemetryHistory)
    private readonly historyRepo: Repository<Uc100TelemetryHistory>,
    @InjectRepository(Uc100DailyStats)
    private readonly dailyStatsRepo: Repository<Uc100DailyStats>,
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
    private readonly mqttService: Uc100MqttService,
  ) {}

  // ── Projects ───────────────────────────────────────────────────────────────

  findAllProjects(): Promise<Project[]> {
    return this.projectRepo.find({ order: { name: 'ASC' } });
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────

  findAll(projectId?: number): Promise<Uc100Device[]> {
    const where: any = {};
    if (projectId) where.project = { id: projectId };
    return this.deviceRepo.find({
      where,
      order: { created_datetime: 'DESC' },
      relations: { project: true },
    });
  }

  findOne(id: number): Promise<Uc100Device | null> {
    return this.deviceRepo.findOne({ where: { id }, relations: { project: true } });
  }

  findByDevEui(devEui: string): Promise<Uc100Device | null> {
    return this.deviceRepo.findOneBy({ dev_eui: devEui });
  }

  async update(id: number, data: Partial<Uc100Device> & { projectId?: number | null }): Promise<Uc100Device | null> {
    const device = await this.findOne(id);
    if (!device) return null;

    // Handle project assignment / unassignment
    if ('projectId' in data) {
      if (data.projectId) {
        const project = await this.projectRepo.findOneBy({ id: data.projectId });
        device.project = project;
      } else {
        device.project = null;
      }
      delete (data as any).projectId;
    }

    const updated = this.deviceRepo.merge(device, data);
    return this.deviceRepo.save(updated);
  }

  async remove(id: number): Promise<void> {
    await this.deviceRepo.delete(id);
  }

  // ── Dashboard Summary ─────────────────────────────────────────────────────

  async getDashboardSummary(projectId?: number, startDate?: string, endDate?: string) {
    const where: any = {};
    if (projectId) where.project = { id: projectId };

    const devices = await this.deviceRepo.find({ where, relations: { project: true } });
    const total = devices.length;
    const online = devices.filter(d => d.is_online === 1).length;
    const offline = total - online;
    const lowBattery = devices.filter(d => Number(d.battery_percent) <= 20).length;
    const lighting = devices.filter(d => Number(d.led_status) > 0).length;

    // Sum daily stats — scoped to devices in this project if applicable
    const devEuis = devices.map(d => d.dev_eui);
    let allStats: Uc100DailyStats[] = [];
    if (devEuis.length > 0) {
      const dateWhere: any = startDate && endDate ? { date: Between(startDate, endDate) } : {};
      allStats = await this.dailyStatsRepo.find({ where: dateWhere });
      // Filter by device EUIs in this project
      if (projectId) {
        allStats = allStats.filter(s => devEuis.includes(s.dev_eui));
      }
    }

    let totalEnergyKWh = 0;
    let totalMoneySavedRM = 0;
    let totalCo2PreventedKg = 0;
    allStats.forEach(stat => {
      totalEnergyKWh += Number(stat.energyGeneratedKWh) || 0;
      totalMoneySavedRM += Number(stat.moneySavedRM) || 0;
      totalCo2PreventedKg += Number(stat.co2PreventedKg) || 0;
    });

    // Weather from Open-Meteo (free, no API key required)
    let weather: any = null;
    try {
      let lat = 3.1390; // Default KL
      let lon = 101.6869;
      const deviceWithLoc = devices.find(d => d.latitude != null && d.longitude != null);
      if (deviceWithLoc) {
        lat = Number(deviceWithLoc.latitude);
        lon = Number(deviceWithLoc.longitude);
      }
      const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto`);
      if (response.ok) {
        const data = await response.json();
        const current = data.current;
        const code = current.weather_code;
        let desc = 'Unknown'; let icon = 'cloud';
        if (code === 0) { desc = 'Clear Sky'; icon = 'light_mode'; }
        else if (code >= 1 && code <= 3) { desc = 'Partly Cloudy'; icon = 'partly_cloudy_day'; }
        else if (code === 45 || code === 48) { desc = 'Foggy'; icon = 'foggy'; }
        else if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) { desc = 'Rainy'; icon = 'rainy'; }
        else if (code >= 95) { desc = 'Thunderstorm'; icon = 'thunderstorm'; }
        weather = { temp: current.temperature_2m, humidity: current.relative_humidity_2m, windSpeed: current.wind_speed_10m, desc, icon };
      }
    } catch (e) { /* weather is optional */ }

    return { total, online, offline, lowBattery, lighting, totalEnergyKWh, totalMoneySavedRM, totalCo2PreventedKg, weather, mqttConnected: this.mqttService.isConnected() };
  }

  // ── Historical Graph Data ─────────────────────────────────────────────────

  async getHistoricalGraphData(projectId?: number, startDate?: string, endDate?: string) {
    let allStats: Uc100DailyStats[];
    const dateWhere: any = {};
    if (startDate && endDate) dateWhere.date = Between(startDate, endDate);

    allStats = await this.dailyStatsRepo.find({ where: dateWhere, order: { date: 'ASC' } });

    // Filter by project devices if needed
    if (projectId) {
      const devices = await this.deviceRepo.find({ where: { project: { id: projectId } }, relations: { project: true } });
      const devEuis = devices.map(d => d.dev_eui);
      allStats = allStats.filter(s => devEuis.includes(s.dev_eui));
    }

    const labels = [...new Set(allStats.map(s => s.date))].sort();
    const energyData = labels.map(date =>
      allStats.filter(s => s.date === date).reduce((sum, stat) => sum + Number(stat.energyGeneratedKWh), 0)
    );

    return {
      labels,
      datasets: [{ 
        label: 'Green Energy (kWh)', 
        data: energyData, 
        borderColor: '#10b981', 
        backgroundColor: 'rgba(16, 185, 129, 0.1)', 
        borderWidth: 2 
      }]
    };
  }

  // ── History ───────────────────────────────────────────────────────────────

  async getHistoryByDeviceAndDate(devEui: string, date: string): Promise<Uc100TelemetryHistory[]> {
    const start = new Date(`${date}T00:00:00+08:00`);
    const end = new Date(`${date}T23:59:59+08:00`);
    return this.historyRepo.find({
      where: { dev_eui: devEui, created_datetime: Between(start, end) },
      order: { timestamp: 'ASC' },
    });
  }

  async getRecentHistory(devEui: string, limit = 48): Promise<Uc100TelemetryHistory[]> {
    return this.historyRepo.find({
      where: { dev_eui: devEui },
      order: { created_datetime: 'DESC' },
      take: limit,
    });
  }

  // ── Device Control (Downlink Commands) ───────────────────────────────────

  async executeAction(devEui: string, action: 'ON' | 'OFF' | 'DIM' | 'SET_TIMERS', options?: { power?: number; timer1?: number; timer2?: number; timer3?: number; timer1Dim?: number; timer2Dim?: number; timer3Dim?: number }): Promise<void> {
    const device = await this.deviceRepo.findOneBy({ dev_eui: devEui });
    if (!device) throw new NotFoundException(`UC100 device ${devEui} not found`);

    // The mqttService now natively handles SET_TIMERS by generating all 6 Modbus frames in sequence.
    await this.mqttService.sendDownlink(devEui, action, options);
  }
}
