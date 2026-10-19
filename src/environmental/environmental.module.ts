import { Module } from '@nestjs/common';
import { EnvironmentalService } from './environmental.service';
import { EnvironmentalController } from './environmental.controller';

@Module({
  controllers: [EnvironmentalController],
  providers: [EnvironmentalService],
  exports: [EnvironmentalService],
})
export class EnvironmentalModule {}
