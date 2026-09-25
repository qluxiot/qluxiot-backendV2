import { Controller, Get, Query, Delete, Param, UseGuards } from '@nestjs/common';
import { LedDevicesService } from '../services/led-devices.service';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';

@Controller('api/led/dashboard')
export class LedDashboardController {
  constructor(private readonly ledDevicesService: LedDevicesService) {}

  @Get('summary')
  async getSummary(
    @Query('projectId') projectId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string
  ) {
    const id = projectId ? parseInt(projectId, 10) : undefined;
    return this.ledDevicesService.getDashboardSummary(id, startDate, endDate);
  }

  @Get('graph')
  getGraphData(
    @Query('projectId') projectId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string
  ) { 
    const id = projectId ? parseInt(projectId, 10) : undefined;
    return this.ledDevicesService.getHistoricalGraphData(id, startDate, endDate); 
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Super Admin')
  @Delete('reset-stats')
  resetStats(@Query('projectId') projectId?: string) {
    const id = projectId ? parseInt(projectId, 10) : undefined;
    return this.ledDevicesService.resetDashboardStats(id);
  }
}

