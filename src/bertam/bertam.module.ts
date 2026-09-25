import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BertamDevice } from './entities/bertam-device.entity';
import { BertamTelemetryHistory } from './entities/bertam-telemetry-history.entity';
import { BertamDailyStats } from './entities/bertam-daily-stats.entity';
import { BertamDevicesService } from './services/bertam-devices.service';
import { BertamMqttService } from './services/bertam-mqtt.service';
import { BertamController } from './bertam.controller';

@Module({
  imports: [TypeOrmModule.forFeature([BertamDevice, BertamTelemetryHistory, BertamDailyStats])],
  controllers: [BertamController],
  providers: [BertamDevicesService, BertamMqttService],
  exports: [BertamDevicesService],
})
export class BertamModule {}
