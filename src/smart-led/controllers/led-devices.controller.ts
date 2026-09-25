import { Controller, Get, Post, Delete, Param, Body, Query } from '@nestjs/common';
import { LedDevicesService } from '../services/led-devices.service';
import { LedTelemetryHistoryService } from '../services/led-telemetry-history.service';
import { Public } from '../../auth/public.decorator';

@Controller('api/led/devices')
export class LedDevicesController {
  constructor(
    private readonly ledDevicesService: LedDevicesService,
    private readonly historyService: LedTelemetryHistoryService
  ) {}

  @Get()
  async findAll(@Query('projectId') projectId?: string) {
    const id = projectId ? parseInt(projectId, 10) : undefined;
    return this.ledDevicesService.findAll(id);
  }

  @Post()
  async create(@Body() body: { serial: string, name?: string, projectId?: number, device_type?: string, deviceType?: string, status?: string, latitude?: number, longitude?: number }) {
    return this.ledDevicesService.create(body.serial, body.name, body.projectId, body.device_type || body.deviceType, body.status, body.latitude, body.longitude);
  }

  @Public()
  @Delete(':serial')
  remove(@Param('serial') serial: string) {
    return this.ledDevicesService.remove(serial);
  }

  @Post(':serial/execute-action')
  executeAction(
    @Param('serial') serial: string,
    @Body() body: { action: string; power?: number }
  ) {
    return this.ledDevicesService.executeAction(serial, body.action, body.power);
  }

  @Post(':serial/sync')
  async sync(@Param('serial') serial: string) {
    return this.ledDevicesService.syncDeviceTelemetry(serial);
  }

  @Get(':serial/history/:date')
  async getHistory(@Param('serial') serial: string, @Param('date') dateStr: string) {
    return this.historyService.getHistoryByDate(serial, dateStr);
  }

  @Post(':serial/bind-gateway')
  bindGateway(
    @Param('serial') serial: string,
    @Body('gatewaySerial') gatewaySerial: string,
    @Body('action') action: 'add' | 'del' = 'add'
  ) {
    return this.ledDevicesService.bindGateway(serial, gatewaySerial, action);
  }
}
