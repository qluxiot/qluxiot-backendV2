import { Controller, Get, Query } from '@nestjs/common';
import { EnvironmentalService } from './environmental.service';
import type { EnvironmentalTelemetry } from './environmental.service';
import { Public } from '../auth/public.decorator';

@Controller('api/environmental')
export class EnvironmentalController {
  constructor(private readonly envService: EnvironmentalService) {}

  @Public()
  @Get('live')
  getLive(): EnvironmentalTelemetry {
    return this.envService.getLiveTelemetry();
  }

  @Public()
  @Get('history')
  getHistory(@Query('limit') limit?: string, @Query('date') date?: string) {
    return this.envService.getHistory(limit ? parseInt(limit, 10) : 48, date);
  }
}
