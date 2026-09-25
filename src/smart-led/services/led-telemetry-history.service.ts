import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LedTelemetryHistory } from '../entities/led-telemetry-history.entity';
import { LedDevice } from '../entities/led-device.entity';

@Injectable()
export class LedTelemetryHistoryService {
  private readonly logger = new Logger(LedTelemetryHistoryService.name);

  constructor(
    @InjectRepository(LedTelemetryHistory)
    private readonly historyRepository: Repository<LedTelemetryHistory>,
  ) {}

  async logTelemetry(device: LedDevice): Promise<LedTelemetryHistory> {
    const log = this.historyRepository.create({
      serial: device.serial,
      voltage: device.voltage,
      current: device.current,
      active_power: device.active_power,
      total_active_power: device.total_active_power,
      brightness: device.brightness,
      brightness2: device.brightness2,
      timestamp: device.timestamp,
    });
    return this.historyRepository.save(log);
  }

  async getHistoryByDate(serial: string, dateStr: string): Promise<LedTelemetryHistory[]> {
    // Force the time boundary strictly to Malaysia Time (UTC+8)
    const startOfDay = new Date(`${dateStr}T00:00:00.000+08:00`);
    const endOfDay = new Date(`${dateStr}T23:59:59.999+08:00`);

    return this.historyRepository.createQueryBuilder('history')
      .where('history.serial = :serial', { serial })
      .andWhere('history.created_datetime >= :startOfDay', { startOfDay })
      .andWhere('history.created_datetime <= :endOfDay', { endOfDay })
      .orderBy('history.created_datetime', 'ASC')
      .getMany();
  }
}
