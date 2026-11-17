import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { TelemetryHistory } from '../entities/telemetry-history.entity';

@Injectable()
export class TelemetryHistoryService {
  constructor(
    @InjectRepository(TelemetryHistory)
    private repo: Repository<TelemetryHistory>,
  ) {}

  async getHistoryByDate(serial: string, dateStr: string): Promise<TelemetryHistory[]> {
    // dateStr format: YYYY-MM-DD. Force timezone to Malaysia Time (UTC+8)
    const start = new Date(`${dateStr}T00:00:00.000+08:00`);
    const end = new Date(`${dateStr}T23:59:59.999+08:00`);

    // The timestamp column is a string from Nengjia, but we also have created_datetime which is a real Date
    // We will query by created_datetime because it's reliable for the day we captured it
    return this.repo.find({
      where: {
        serial,
        created_datetime: Between(start, end),
      },
      order: {
        created_datetime: 'ASC', // Chronological order for graphs
      },
    });
  }

  async getActiveDates(serial: string): Promise<string[]> {
    // Only return dates where the device was genuinely ONLINE and actively communicating,
    // not stale cached data repeatedly recorded by the cron server.
    const raw = await this.repo.createQueryBuilder('history')
      .select('TO_CHAR(TO_TIMESTAMP(CAST(history.timestamp AS BIGINT) / 1000.0) AT TIME ZONE \'Asia/Kuala_Lumpur\', \'YYYY-MM-DD\')', 'date')
      .where('history.serial = :serial', { serial })
      .andWhere('history.timestamp IS NOT NULL')
      .andWhere('history.timestamp ~ \'^[0-9]+$\'')
      .groupBy('date')
      .having('COUNT(DISTINCT history.timestamp) >= 2')
      .orderBy('date', 'ASC')
      .getRawMany();

    return raw.map(r => r.date).filter(Boolean);
  }
}
