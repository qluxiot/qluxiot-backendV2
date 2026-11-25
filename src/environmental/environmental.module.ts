import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EnvironmentalService } from './environmental.service';
import { EnvironmentalController } from './environmental.controller';
import { EnvironmentalHistory } from './environmental-history.entity';

@Module({
  imports: [TypeOrmModule.forFeature([EnvironmentalHistory])],
  controllers: [EnvironmentalController],
  providers: [EnvironmentalService],
  exports: [EnvironmentalService],
})
export class EnvironmentalModule {}
