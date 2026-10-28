import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { LedScheduleProfile } from '../entities/led-schedule-profile.entity';
import { LedDevice } from '../entities/led-device.entity';
import { User } from '../../users/entities/user.entity';
import { GuangmangService } from '../../guangmang/guangmang.service';
import { EmailService } from '../../notification-setup/email/email.service';

@Injectable()
export class LedSchedulesService {
  private readonly logger = new Logger(LedSchedulesService.name);

  constructor(
    @InjectRepository(LedScheduleProfile)
    private readonly profileRepo: Repository<LedScheduleProfile>,
    @InjectRepository(LedDevice)
    private readonly deviceRepo: Repository<LedDevice>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly guangmangService: GuangmangService,
    private readonly emailService: EmailService,
  ) {}

  async findAll(): Promise<LedScheduleProfile[]> {
    return this.profileRepo.find({
      relations: {
        devices: { project: true },
        created_by: true,
        updated_by: true,
      },
      order: { id: 'DESC' },
    });
  }

  async findOne(id: number): Promise<LedScheduleProfile> {
    const profile = await this.profileRepo.findOne({
      where: { id },
      relations: {
        devices: { project: true },
        created_by: true,
        updated_by: true,
      },
    });
    if (!profile) throw new NotFoundException(`Schedule Profile ${id} not found`);
    return profile;
  }

  async create(data: { name: string; rules: any[] }, userId?: number): Promise<LedScheduleProfile> {
    const profile = this.profileRepo.create({
      ...data,
      created_by: userId ? ({ id: userId } as any) : null,
      updated_by: userId ? ({ id: userId } as any) : null,
    });
    return this.profileRepo.save(profile);
  }

  async update(id: number, data: { name?: string; rules?: any[] }, userId?: number): Promise<LedScheduleProfile> {
    const profile = await this.findOne(id);
    if (data.name) profile.name = data.name;
    if (data.rules) profile.rules = data.rules;
    if (userId) profile.updated_by = { id: userId } as any;
    return this.profileRepo.save(profile);
  }

  async remove(id: number): Promise<void> {
    const profile = await this.findOne(id);
    // Devices will automatically have their schedule_profile_id set to NULL due to SET NULL cascade
    await this.profileRepo.remove(profile);
  }

  async bulkAssign(profileId: number | null, deviceSerials: string[], userId?: number): Promise<void> {
    if (deviceSerials.length === 0) return;

    let profile: LedScheduleProfile | null = null;
    if (profileId !== null) {
      profile = await this.findOne(profileId);
    }

    const devices = await this.deviceRepo.find({ 
      where: { serial: In(deviceSerials) },
      relations: { project: true }
    });

    const now = new Date();
    const assignedUser = userId ? ({ id: userId } as any) : null;

    for (const device of devices) {
      device.schedule_profile = profile;
      device.schedule_assigned_at = profile ? now : null;
      device.schedule_assigned_by = profile ? assignedUser : null;
    }

    await this.deviceRepo.save(devices);
    this.logger.log(`Bulk assigned profile ${profileId} to ${devices.length} LED devices.`);

    // Trigger Email Notification to iqbal@qluxgroup.com
    try {
      let userName = 'Administrator / User';
      if (userId) {
        const u = await this.userRepo.findOne({ where: { id: userId } });
        if (u) {
          userName = u.name || u.username;
        }
      }

      await this.emailService.sendScheduleAssignmentEmail({
        moduleName: 'Smart LED Streetlight',
        assignedByName: userName,
        assignedAt: now,
        scheduleName: profile ? profile.name : 'Cleared (None)',
        scheduleRules: profile?.rules || [],
        devices: devices.map(d => ({
          serial: d.serial,
          name: d.name,
          projectName: d.project?.name,
        })),
      });
    } catch (mailErr) {
      this.logger.error(`Failed to send schedule assignment email: ${mailErr.message}`);
    }

    // Push the schedule natively to the LED hardware so it runs autonomously using its internal clock
    if (profile && profile.rules && profile.rules.length > 0) {
      this.logger.log(`[LED] Pushing schedule "${profile.name}" to ${devices.length} device(s) hardware...`);
      
      let cloudList: any[] = [];
      try {
         cloudList = await this.guangmangService.getDeviceList(1, 1000);
      } catch (err) {
         this.logger.warn(`Failed to fetch device list from cloud before assigning schedules: ${err.message}`);
      }

      for (const device of devices) {
        try {
          const cloudBasic = cloudList.find((c: any) => c.equipmentNum === device.serial || c.equipmentId === device.serial);
          if (!cloudBasic) {
             throw new Error(`Device ${device.serial} not found in Guangmang Cloud, cannot assign schedule.`);
          }
          const equipmentId = cloudBasic.equipmentId;

          await this.guangmangService.distributeLedSchedule(equipmentId, profile.rules);
          this.logger.log(`[LED] Successfully pushed schedule to device ${device.serial} (Internal ID: ${equipmentId})`);
        } catch (err) {
          // Log the error but don't fail the whole bulk assign
          this.logger.error(`[LED] Failed to push schedule to device ${device.serial}`, err.message);
        }
      }
    }
  }
}
