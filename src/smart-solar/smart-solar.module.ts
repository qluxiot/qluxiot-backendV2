import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SolarDevice } from './entities/solar-device.entity';
import { TelemetryHistory } from './entities/telemetry-history.entity';

import { SolarScheduleProfile } from './entities/solar-schedule-profile.entity';
import { SolarDailyStats } from './entities/solar-daily-stats.entity';

import { SolarDevicesController } from './controllers/solar-devices.controller';
import { SolarDashboardController } from './controllers/solar-dashboard.controller';
import { SolarMonitoringController } from './controllers/solar-monitoring.controller';
import { SolarSchedulesController } from './controllers/solar-schedules.controller';

import { SolarDevicesService } from './services/solar-devices.service';
import { TelemetryHistoryService } from './services/telemetry-history.service';
import { SolarCronService } from './services/solar-cron.service';
import { SolarSchedulesService } from './services/solar-schedules.service';

import { NengjiaModule } from '../nengjia/nengjia.module';
import { AlarmsModule } from '../alarms/alarms.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([SolarDevice, TelemetryHistory, SolarScheduleProfile, SolarDailyStats]), NengjiaModule, AlarmsModule, AuthModule],
  controllers: [
    SolarDevicesController,
    SolarDashboardController,
    SolarMonitoringController,
    SolarSchedulesController,
  ],
  providers: [SolarDevicesService, TelemetryHistoryService, SolarCronService, SolarSchedulesService],
  exports: [SolarDevicesService, TelemetryHistoryService, SolarCronService, SolarSchedulesService],
})
export class SmartSolarModule {}
