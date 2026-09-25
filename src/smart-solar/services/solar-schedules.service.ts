import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { SolarScheduleProfile } from '../entities/solar-schedule-profile.entity';
import { SolarDevice } from '../entities/solar-device.entity';
import { NengjiaService } from '../../nengjia/nengjia.service';

@Injectable()
export class SolarSchedulesService {
  private readonly logger = new Logger(SolarSchedulesService.name);

  constructor(
    @InjectRepository(SolarScheduleProfile)
    private readonly profileRepo: Repository<SolarScheduleProfile>,
    @InjectRepository(SolarDevice)
    private readonly deviceRepo: Repository<SolarDevice>,
    private readonly nengjiaService: NengjiaService,
  ) {}

  async findAll(): Promise<SolarScheduleProfile[]> {
    return this.profileRepo.find({ relations: { devices: true } });
  }

  async findOne(id: number): Promise<SolarScheduleProfile> {
    const profile = await this.profileRepo.findOne({ where: { id }, relations: { devices: true } });
    if (!profile) throw new NotFoundException(`Schedule Profile ${id} not found`);
    return profile;
  }

  async create(data: { name: string; rules: any[] }): Promise<SolarScheduleProfile> {
    const profile = this.profileRepo.create(data);
    return this.profileRepo.save(profile);
  }

  async update(id: number, data: { name?: string; rules?: any[] }): Promise<SolarScheduleProfile> {
    const profile = await this.findOne(id);
    if (data.name) profile.name = data.name;
    if (data.rules) profile.rules = data.rules;
    return this.profileRepo.save(profile);
  }

  async remove(id: number): Promise<void> {
    const profile = await this.findOne(id);
    await this.profileRepo.remove(profile);
  }

  async bulkAssign(profileId: number | null, deviceSerials: string[]): Promise<void> {
    if (deviceSerials.length === 0) return;

    let profile: SolarScheduleProfile | null = null;
    if (profileId !== null) {
      profile = await this.findOne(profileId);
    }

    const devices = await this.deviceRepo.find({ where: { serial: In(deviceSerials) } });

    for (const device of devices) {
      device.schedule_profile = profile;
    }

    await this.deviceRepo.save(devices);
    this.logger.log(`Bulk assigned profile ${profileId} to ${devices.length} Solar devices.`);

    // Push the schedule natively to the hardware so it runs autonomously
    if (profile && profile.rules && profile.rules.length > 0) {
      this.logger.log(`[SOLAR] Pushing schedule "${profile.name}" to ${devices.length} device(s) hardware...`);
      for (const device of devices) {
        try {
          await this.nengjiaService.distributeSolarSchedule(device.serial, profile.rules);
          this.logger.log(`[SOLAR] Successfully pushed schedule to device ${device.serial}`);
        } catch (err) {
          // Log the error but don't fail the whole bulk assign
          this.logger.error(`[SOLAR] Failed to push schedule to device ${device.serial}`, err);
        }
      }
    }
  }
}
