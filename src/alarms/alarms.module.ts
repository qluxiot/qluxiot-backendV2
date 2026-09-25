import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Alarm } from './entities/alarm.entity';
import { AlarmsService } from './services/alarms.service';
import { AlarmsController } from './controllers/alarms.controller';
import { NotificationSetupModule } from '../notification-setup/notification-setup.module';
import { NotificationChannel } from '../notification-setup/entities/notification-channel.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Alarm, NotificationChannel]),
    NotificationSetupModule,
  ],
  controllers: [AlarmsController],
  providers: [AlarmsService],
  exports: [AlarmsService],
})
export class AlarmsModule {}

