import { Controller, Get, Post, Body, Put, Param, Delete, Query } from '@nestjs/common';
import { SolarDevicesService } from '../services/solar-devices.service';
import { TelemetryHistoryService } from '../services/telemetry-history.service';
import { SolarDevice } from '../entities/solar-device.entity';

@Controller('api/solar/devices')
export class SolarDevicesController {
  constructor(
    private readonly service: SolarDevicesService,
    private readonly historyService: TelemetryHistoryService,
  ) {}

  @Get()
  findAll(@Query('projectId') projectId?: string) { 
    const id = projectId ? parseInt(projectId, 10) : undefined;
    return this.service.findAll(id); 
  }

  @Get(':id')
  findOne(@Param('id') id: string) { return this.service.findOne(+id); }

  @Post()
  create(@Body() body: any) {
    const { projectId, ...data } = body;
    const deviceData = { ...data };
    if (projectId !== undefined) {
      deviceData.project = projectId ? { id: projectId } : null;
    }
    return this.service.create(deviceData);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: any) {
    const { projectId, ...data } = body;
    const deviceData = { ...data };
    if (projectId !== undefined) {
      deviceData.project = projectId ? { id: projectId } : null;
    }
    return this.service.update(+id, deviceData);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(+id);
  }

  @Post(':serial/execute-action')
  executeAction(
    @Param('serial') serial: string,
    @Body() body: { action: string; power?: number }
  ) {
    return this.service.executeAction(serial, body.action, body.power);
  }

  @Post(':serial/sync')
  syncDevice(@Param('serial') serial: string) { return this.service.syncDeviceTelemetry(serial); }

  @Get(':serial/history/:date')
  getHistory(@Param('serial') serial: string, @Param('date') date: string) {
    return this.historyService.getHistoryByDate(serial, date);
  }

  @Post(':serial/bind-gateway')
  bindGateway(
    @Param('serial') serial: string,
    @Body('gatewaySerial') gatewaySerial: string,
    @Body('action') action: 'add' | 'del' = 'add'
  ) {
    return this.service.bindGateway(serial, gatewaySerial, action);
  }
}
