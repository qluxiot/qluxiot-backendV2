import { Controller, Get, Post, Put, Delete, Body, Param, ParseIntPipe } from '@nestjs/common';
import { LedSchedulesService } from '../services/led-schedules.service';

@Controller('api/led/schedules')
export class LedSchedulesController {
  constructor(private readonly schedulesService: LedSchedulesService) {}

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
