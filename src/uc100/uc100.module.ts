import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Uc100Device } from './entities/uc100-device.entity';
import { Uc100TelemetryHistory } from './entities/uc100-telemetry-history.entity';
import { Uc100DailyStats } from './entities/uc100-daily-stats.entity';
import { Uc100MqttService } from './services/uc100-mqtt.service';
import { Uc100DevicesService } from './services/uc100-devices.service';
import { Uc100CronService } from './services/uc100-cron.service';
import { Uc100Controller } from './uc100.controller';
import { Project } from '../projects/entities/project.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Uc100Device, Uc100TelemetryHistory, Uc100DailyStats, Project])],
  controllers: [Uc100Controller],
  providers: [Uc100MqttService, Uc100DevicesService, Uc100CronService],
  exports: [Uc100DevicesService],
})
export class Uc100Module {}
