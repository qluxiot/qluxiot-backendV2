import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Project } from './entities/project.entity';
import { ProjectsService } from './projects.service';
import { ProjectsController } from './projects.controller';
import { SmartSolarModule } from '../smart-solar/smart-solar.module';
import { SmartLedModule } from '../smart-led/smart-led.module';
import { AlarmsModule } from '../alarms/alarms.module';
import { Uc100Module } from '../uc100/uc100.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Project]),
    forwardRef(() => SmartSolarModule),
    forwardRef(() => SmartLedModule),
    forwardRef(() => Uc100Module),
    AlarmsModule,
  ],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService, TypeOrmModule],
})
export class ProjectsModule {}
