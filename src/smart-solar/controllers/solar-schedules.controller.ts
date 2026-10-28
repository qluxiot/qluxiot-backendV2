import { Controller, Get, Post, Put, Delete, Body, Param, ParseIntPipe, Req } from '@nestjs/common';
import { SolarSchedulesService } from '../services/solar-schedules.service';

@Controller('api/solar/schedules')
export class SolarSchedulesController {
  constructor(private readonly schedulesService: SolarSchedulesService) {}

  @Get()
  findAll() {
    return this.schedulesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.schedulesService.findOne(id);
  }

  @Post()
  create(@Body() data: { name: string; rules: any[] }, @Req() req: any) {
    const userId = req.user?.sub || req.user?.id;
    return this.schedulesService.create(data, userId);
  }

  @Put(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() data: { name?: string; rules?: any[] }, @Req() req: any) {
    const userId = req.user?.sub || req.user?.id;
    return this.schedulesService.update(id, data, userId);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.schedulesService.remove(id);
  }

  @Post('bulk-assign')
  bulkAssign(@Body() data: { profileId: number | null; deviceSerials: string[] }, @Req() req: any) {
    const userId = req.user?.sub || req.user?.id;
    return this.schedulesService.bulkAssign(data.profileId, data.deviceSerials, userId);
  }
}
