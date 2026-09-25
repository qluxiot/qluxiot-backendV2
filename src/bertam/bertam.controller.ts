import { Controller, Get, Put, Delete, Param, Body, Query } from '@nestjs/common';
import { BertamDevicesService } from './services/bertam-devices.service';

@Controller('api/bertam')
export class BertamController {
  constructor(private readonly service: BertamDevicesService) {}

  // ── Dashboard ──────────────────────────────────────────────────────────────
  @Get('dashboard/summary')
  getSummary(
    @Query('site') site?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string
  ) {
    return this.service.getDashboardSummary(site, startDate, endDate);
  }

  @Get('dashboard/graph')
  getHistoricalGraphData(
    @Query('site') site?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string
  ) {
    return this.service.getHistoricalGraphData(site, startDate, endDate);
  }

  // ── Devices (monitoring list) ──────────────────────────────────────────────
  @Get('devices')
  findAll() {
    return this.service.findAll();
  }

  @Get('devices/:id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(+id);
  }

  @Put('devices/:id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.service.update(+id, body);
  }

  @Delete('devices/:id')
  remove(@Param('id') id: string) {
    return this.service.remove(+id);
  }

  // ── History ────────────────────────────────────────────────────────────────
  @Get('history/:devEui')
  getRecentHistory(
    @Param('devEui') devEui: string,
    @Query('date') date?: string,
    @Query('limit') limit?: string,
  ) {
    if (date) {
      return this.service.getHistoryByDeviceAndDate(devEui, date);
    }
    return this.service.getRecentHistory(devEui, limit ? +limit : 48);
  }
}
