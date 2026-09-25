import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Uc100Device } from '../entities/uc100-device.entity';

@Injectable()
export class Uc100CronService {
  private readonly logger = new Logger(Uc100CronService.name);

  constructor(
    @InjectRepository(Uc100Device)
    private readonly deviceRepo: Repository<Uc100Device>,
  ) {}

  /**
   * Runs every minute to check for offline UC100 devices.
   * If a device hasn't sent an uplink in the last 5 minutes, mark it as offline.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async checkOfflineDevices() {
    this.logger.debug('[UC100 Cron] Checking for offline devices...');
    
    // Calculate the threshold time (5 minutes ago)
    const fiveMinutesAgo = new Date();
    fiveMinutesAgo.setMinutes(fiveMinutesAgo.getMinutes() - 5);

    try {
      // Find all devices that are currently marked online but haven't updated in 5 mins
      const offlineDevices = await this.deviceRepo.find({
        where: {
          is_online: 1,
          updated_datetime: LessThan(fiveMinutesAgo)
        }
      });

      if (offlineDevices.length > 0) {
        this.logger.warn(`[UC100 Cron] Found ${offlineDevices.length} devices that went offline.`);
        
        for (const device of offlineDevices) {
          device.is_online = 0;
          await this.deviceRepo.save(device);
          this.logger.log(`[UC100 Cron] Marked device ${device.dev_eui} as offline.`);
        }
      }
    } catch (error) {
      this.logger.error('[UC100 Cron] Failed to check offline devices', error);
    }
  }
}
