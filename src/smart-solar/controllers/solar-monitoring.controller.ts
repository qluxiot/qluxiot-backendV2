import { Controller, Get, Query } from '@nestjs/common';
import { SolarDevicesService } from '../services/solar-devices.service';

@Controller('api/solar/solar-monitoring')
export class SolarMonitoringController {
  constructor(private readonly service: SolarDevicesService) {}

  @Get()
  getSolarMonitoring(@Query('projectId') projectId?: string) {
    const id = projectId ? parseInt(projectId, 10) : undefined;
    return this.service.getSolarMonitoring(id);
  }
}
