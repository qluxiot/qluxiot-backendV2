import { Controller, Get, Post, Put, Body, Param, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AlarmsService } from '../services/alarms.service';
import { Public } from '../../auth/public.decorator';

@Controller('api/alarms')
export class AlarmsController {
  constructor(private readonly alarmsService: AlarmsService) { }

  @Get()
  async getAlarms(
    @Query('pageNumber') pageNumber = 1,
    @Query('pageSize') pageSize = 12,
    @Query('deviceType') deviceType?: string,
    @Query('projectId') queryProjectId?: string,
    @Req() req?: Request,
  ) {
    const user = (req as any)?.['user'];

    // If the user is scoped to a specific project, strictly filter to that project only.
    if (user?.projectId) {
      return this.alarmsService.findAll(Number(pageNumber), Number(pageSize), deviceType, Number(user.projectId));
    }

    // Admin: can filter by optional queryProjectId, otherwise sees all alarms across all projects
    const filterProjectId = queryProjectId ? Number(queryProjectId) : undefined;
    return this.alarmsService.findAll(Number(pageNumber), Number(pageSize), deviceType, filterProjectId);
  }

  @Put(':id/handle')
  async handleAlarm(@Param('id') id: string) {
    return this.alarmsService.handleAlarm(Number(id));
  }

  // A webhook/internal endpoint to manually trigger alarms if needed
  @Public() // Can be secured later
  @Post('trigger')
  async triggerAlarm(
    @Body() body: { serial: string; name: string; device_type: string; warning_information: string; english: string },
  ) {
    return this.alarmsService.triggerAlarm(body);
  }
}
