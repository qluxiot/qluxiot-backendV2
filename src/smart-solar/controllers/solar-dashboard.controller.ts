import { Controller, Get, Query, Delete, Param, UseGuards } from '@nestjs/common';
import { SolarDevicesService } from '../services/solar-devices.service';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';

@Controller('api/solar/dashboard')
export class SolarDashboardController {
  constructor(private readonly service: SolarDevicesService) {}

  @Get('summary')
  async getSummary(
    @Query('projectId') projectId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string
  ) { 
    const id = projectId ? parseInt(projectId, 10) : undefined;
    return this.service.getDashboardSummary(id, startDate, endDate); 
  }

  @Get('graph')
  getGraphData(
    @Query('projectId') projectId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string
  ) { 
    const id = projectId ? parseInt(projectId, 10) : undefined;
    return this.service.getHistoricalGraphData(id, startDate, endDate); 
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Super Admin')
  @Delete('reset-stats')
  resetStats(@Query('projectId') projectId?: string) {
    const id = projectId ? parseInt(projectId, 10) : undefined;
    return this.service.resetDashboardStats(id);
  }
}

