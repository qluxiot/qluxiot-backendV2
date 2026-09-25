import { Injectable, NotFoundException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Project } from './entities/project.entity';
import { SolarDevicesService } from '../smart-solar/services/solar-devices.service';
import { LedDevicesService } from '../smart-led/services/led-devices.service';
import { AlarmsService } from '../alarms/services/alarms.service';
import { LedSchedulesService } from '../smart-led/services/led-schedules.service';
import { BertamDevicesService } from '../bertam/services/bertam-devices.service';
import { Uc100DevicesService } from '../uc100/services/uc100-devices.service';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project)
    private readonly repo: Repository<Project>,
    private moduleRef: ModuleRef,
  ) {}

  findAll(): Promise<Project[]> {
    return this.repo.find({ order: { name: 'ASC' } });
  }

  async findOne(id: number): Promise<Project> {
    const project = await this.repo.findOneBy({ id });
    if (!project) throw new NotFoundException(`Project #${id} not found`);
    return project;
  }

  create(body: { name: string; description?: string; location?: string }): Promise<Project> {
    const project = this.repo.create(body);
    return this.repo.save(project);
  }

  async update(id: number, body: { name?: string; description?: string; location?: string }): Promise<Project> {
    const project = await this.findOne(id);
    Object.assign(project, body);
    return this.repo.save(project);
  }

  async remove(id: number): Promise<void> {
    const project = await this.findOne(id);
    await this.repo.remove(project);
  }

  async getOverviewReport(id: number, range: string, type?: string, frontendStartDate?: string, frontendEndDate?: string, site?: string) {
    const project = await this.findOne(id);
    if (!project) throw new Error('Project not found');

    let endDate = new Date();
    let startDate = new Date();
    
    if (frontendStartDate && frontendEndDate) {
      // Append T12:00:00Z to avoid timezone-induced month shifts
      startDate = new Date(frontendStartDate.includes('T') ? frontendStartDate : `${frontendStartDate}T12:00:00Z`);
      endDate = new Date(frontendEndDate.includes('T') ? frontendEndDate : `${frontendEndDate}T12:00:00Z`);
    } else {
      if (range === 'weekly') {
        startDate.setDate(endDate.getDate() - 7);
      } else if (range === 'monthly') {
        startDate.setMonth(endDate.getMonth() - 1);
      } else if (range === 'yearly') {
        startDate.setFullYear(endDate.getFullYear() - 1);
      }
    }

    let formattedRange = '';
    if (range === 'week') {
      formattedRange = `Week ${this.getWeekNumber(startDate)}, ${startDate.getFullYear()}`;
    } else if (range === 'month') {
      formattedRange = startDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    } else if (range === 'year') {
      formattedRange = startDate.getFullYear().toString();
    } else if (range === 'weekly') {
      formattedRange = 'Last 7 Days';
    } else if (range === 'monthly') {
      formattedRange = endDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    } else if (range === 'yearly') {
      formattedRange = endDate.getFullYear().toString();
    } else {
      formattedRange = range;
    }

    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];

    // Get Solar Data
    let solarSummary: any = null;
    let solarGraph: any[] = [];
    if (!type || type === 'solar') {
      try {
        const solarDevicesService = this.moduleRef.get(SolarDevicesService, { strict: false });
        solarSummary = await solarDevicesService.getDashboardSummary(id, startStr, endStr);
        solarGraph = await solarDevicesService.getHistoricalGraphData(id, startStr, endStr);
      } catch (e) {
        console.error('Error fetching solar report data:', e);
        solarSummary = { total: 0, online: 0, offline: 0, lowBattery: 0, totalGreenEnergyKWh: 0, moneySavedRM: 0, co2PreventedKg: 0 };
      }
    }

    // Get LED Data
    let ledSummary: any = null;
    let ledGraph: any[] = [];
    let ledSchedules: any[] = [];
    if (!type || type === 'led') {
      try {
        const ledDevicesService = this.moduleRef.get(LedDevicesService, { strict: false });
        ledSummary = await ledDevicesService.getDashboardSummary(id, startStr, endStr);
        ledGraph = await ledDevicesService.getHistoricalGraphData(id, startStr, endStr);
      } catch (e) {
        console.error('Error fetching led report data:', e);
        ledSummary = { totalDevices: 0, onlineDevices: 0, activeLights: 0, totalPowerConsumption: 0, estimatedCostRM: 0, energySavedKWh: 0, costSavedRM: 0, co2PreventedKg: 0 };
      }

      // Get Lighting Schedules
      try {
        const ledSchedulesService = this.moduleRef.get(LedSchedulesService, { strict: false });
        const profiles = await ledSchedulesService.findAll();
        let targetProfile: any = null;
        for (const p of profiles) {
          if (p.devices && p.devices.some(d => d.project && Number(d.project.id) === Number(id))) {
            targetProfile = p;
            break;
          }
        }
        if (targetProfile && targetProfile.rules && Array.isArray(targetProfile.rules)) {
          ledSchedules = targetProfile.rules.map((r: any) => ({
            type: r.action,
            time: r.time,
            value: r.brightness !== undefined && r.brightness !== null ? `${r.brightness}%` : '-'
          }));
        }
      } catch (e) {}
    }

    // Get Alarms
    let solarAlarmsCount = 0;
    let ledAlarmsCount = 0;
    try {
      const alarmsService = this.moduleRef.get(AlarmsService, { strict: false });
      if (!type || type === 'solar') {
        solarAlarmsCount = await alarmsService.countAlarms(id, 'solar', startStr, endStr);
      }
      if (!type || type === 'led') {
        ledAlarmsCount = await alarmsService.countAlarms(id, 'led', startStr, endStr);
      }
    } catch (e) {}

    // Get Bertam Data
    let bertamSummary: any = null;
    let bertamGraph: any[] = [];
    if (!type || type === 'bertam') {
      try {
        const bertamDevicesService = this.moduleRef.get(BertamDevicesService, { strict: false });
        const targetSite = site || 'All';
        bertamSummary = await bertamDevicesService.getDashboardSummary(targetSite, startStr, endStr);
        const rawGraph = await bertamDevicesService.getHistoricalGraphData(targetSite, startStr, endStr);
        // Map to format OverviewReportComponent expects
        bertamGraph = rawGraph.labels.map((date: string, i: number) => ({
          date,
          energyGeneratedKWh: rawGraph.datasets[0].data[i]
        }));
      } catch (e) {
        console.error('Error fetching bertam report data:', e);
        bertamSummary = { total: 0, online: 0, offline: 0, lowBattery: 0, totalEnergyKWh: 0, totalMoneySavedRM: 0, totalCo2PreventedKg: 0 };
      }
    }

    // Get UC100 Data
    let uc100Summary: any = null;
    let uc100Graph: any[] = [];
    if (!type || type === 'uc100') {
      try {
        const uc100DevicesService = this.moduleRef.get(Uc100DevicesService, { strict: false });
        uc100Summary = await uc100DevicesService.getDashboardSummary(id, startStr, endStr);
        const rawGraph = await uc100DevicesService.getHistoricalGraphData(id, startStr, endStr);
        uc100Graph = rawGraph.labels.map((date: string, i: number) => ({
          date,
          energyGeneratedKWh: rawGraph.datasets[0].data[i]
        }));
      } catch (e) {
        console.error('Error fetching uc100 report data:', e);
        uc100Summary = { total: 0, online: 0, offline: 0, lowBattery: 0, lighting: 0, totalEnergyKWh: 0, totalMoneySavedRM: 0, totalCo2PreventedKg: 0 };
      }
    }

    return {
      type,
      project: {
        id: project.id,
        name: project.name,
      },
      timeRange: {
        range: formattedRange,
        startDate: startStr,
        endDate: endStr,
        generatedAt: new Date().toISOString(),
      },
      solar: solarSummary ? {
        ...solarSummary,
        alarms: solarAlarmsCount,
        historicalData: solarGraph,
      } : null,
      bertam: bertamSummary ? {
        ...bertamSummary,
        alarms: 0, // Bertam alarms not requested yet
        historicalData: bertamGraph,
      } : null,
      uc100: uc100Summary ? {
        ...uc100Summary,
        alarms: 0, // UC100 alarms not yet implemented
        historicalData: uc100Graph,
      } : null,
      led: ledSummary ? {
        ...ledSummary,
        alarms: ledAlarmsCount,
        lightingSchedule: ledSchedules,
        historicalData: ledGraph,
      } : null
    };
  }

  private getWeekNumber(d: Date): number {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  }
}
