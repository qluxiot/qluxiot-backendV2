import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LedDevice } from './entities/led-device.entity';
import { LedTelemetryHistory } from './entities/led-telemetry-history.entity';
import { LedScheduleProfile } from './entities/led-schedule-profile.entity';
import { LedDailyStats } from './entities/led-daily-stats.entity';
import { LedSchedulesService } from './services/led-schedules.service';
import { LedDevicesService } from './services/led-devices.service';
import { LedTelemetryHistoryService } from './services/led-telemetry-history.service';
import { LedCronService } from './services/led-cron.service';
import { LedDevicesController } from './controllers/led-devices.controller';
import { LedDashboardController } from './controllers/led-dashboard.controller';
import { LedSchedulesController } from './controllers/led-schedules.controller';
import { GuangmangModule } from '../guangmang/guangmang.module';
import { AlarmsModule } from '../alarms/alarms.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([LedDevice, LedTelemetryHistory, LedScheduleProfile, LedDailyStats]),
    GuangmangModule,
    AlarmsModule,
    AuthModule,
  ],
  providers: [
    LedDevicesService,
    LedTelemetryHistoryService,
    LedCronService,
    LedSchedulesService,
  ],
  controllers: [
    LedDevicesController,
    LedDashboardController,
    LedSchedulesController,
  ],
  exports: [
    LedDevicesService,
    LedTelemetryHistoryService,
  ],
})
export class SmartLedModule {}
