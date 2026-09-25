import { Controller, Get, Post, Put, Delete, Body, Param, ParseIntPipe } from '@nestjs/common';
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
  create(@Body() data: { name: string; rules: any[] }) {
    return this.schedulesService.create(data);
  }

  @Put(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() data: { name?: string; rules?: any[] }) {
    return this.schedulesService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.schedulesService.remove(id);
  }

  @Post('bulk-assign')
  bulkAssign(@Body() data: { profileId: number | null; deviceSerials: string[] }) {
    return this.schedulesService.bulkAssign(data.profileId, data.deviceSerials);
  }
}
