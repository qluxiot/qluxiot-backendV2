import { Controller, Get, Put, Delete, Post, Param, Body, Query } from '@nestjs/common';
import { Uc100DevicesService } from './services/uc100-devices.service';

@Controller('api/uc100')
export class Uc100Controller {
  constructor(private readonly service: Uc100DevicesService) {}

  // ── Projects ───────────────────────────────────────────────────────────────

  @Get('projects')
  getProjects() {
    return this.service.findAllProjects();
  }

  // ── Dashboard ──────────────────────────────────────────────────────────────

  @Get('dashboard/summary')
  getSummary(
    @Query('projectId') projectId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.service.getDashboardSummary(projectId ? +projectId : undefined, startDate, endDate);
  }

  @Get('dashboard/graph')
  getHistoricalGraphData(
    @Query('projectId') projectId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.service.getHistoricalGraphData(projectId ? +projectId : undefined, startDate, endDate);
  }

  // ── Devices ────────────────────────────────────────────────────────────────

  @Get('devices')
  findAll(@Query('projectId') projectId?: string) {
    return this.service.findAll(projectId ? +projectId : undefined);
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

  // ── Device Control (Downlink Commands) ────────────────────────────────────

  /**
   * Send a control command to a specific UC100 device via MQTT downlink.
   * Body examples:
   *   { "action": "ON" }
   *   { "action": "OFF" }
   *   { "action": "DIM", "power": 50 }
   *   { "action": "SET_TIMERS", "timer1": 14400, "timer2": 21600, "timer3": 7200, "timer1Dim": 100, "timer2Dim": 60, "timer3Dim": 40 }
   */
  @Post('devices/:devEui/action')
  executeAction(
    @Param('devEui') devEui: string,
    @Body() body: { action: 'ON' | 'OFF' | 'DIM' | 'SET_TIMERS'; power?: number; timer1?: number; timer2?: number; timer3?: number; timer1Dim?: number; timer2Dim?: number; timer3Dim?: number },
  ) {
    return this.service.executeAction(devEui, body.action, {
      power: body.power,
      timer1: body.timer1,
      timer2: body.timer2,
      timer3: body.timer3,
      timer1Dim: body.timer1Dim,
      timer2Dim: body.timer2Dim,
      timer3Dim: body.timer3Dim,
    });
  }

  // ── History ────────────────────────────────────────────────────────────────

  @Get('history/:devEui')
  getHistory(
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
