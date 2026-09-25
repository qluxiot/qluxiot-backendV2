import { Controller, Get, Post, Delete, Param, Query, Body } from '@nestjs/common';
import { NengjiaService } from './nengjia.service';
import { LightAction } from './nengjia.types';
import { Public } from '../auth/public.decorator';

@Controller('nengjia')
export class NengjiaController {
  constructor(private readonly nengjiaService: NengjiaService) {}

  @Public()
  @Get('devices')
  getDevices(
    @Query('page') page?: string,
    @Query('size') size?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const pageSize = size ? parseInt(size, 10) : 10;
    return this.nengjiaService.getDeviceList(pageNum, pageSize);
  }

  @Public()
  @Get('device/:serial')
  getDevice(@Param('serial') serial: string) {
    return this.nengjiaService.getDeviceStatus(serial);
  }

  @Public()
  @Post('device/:serial/light/:action')
  controlLight(
    @Param('serial') serial: string,
    @Param('action') action: string,
    @Query('power') power?: string,
  ) {
    const powerNum = power ? parseInt(power, 10) : undefined;
    return this.nengjiaService.adjustLight(serial, action as LightAction, powerNum);
  }

  // =========================
  // DEVICE REGISTRATION
  // =========================

  @Public()
  @Post('device/:serial/add')
  addDevice(@Param('serial') serial: string) {
    return this.nengjiaService.addDevice(serial);
  }

  @Public()
  @Delete('device/:serial/delete')
  @Get('device/:serial/delete') // Added GET alias so you can test it easily from a browser address bar!
  removeDevice(@Param('serial') serial: string) {
    return this.nengjiaService.removeDevice(serial);
  }

  @Public()
  @Post('device/:serial/update-status')
  updateDeviceStatus(@Param('serial') serial: string) {
    return this.nengjiaService.updateDeviceStatus(serial);
  }

  @Public()
  @Post('device/:serial/update-params')
  updateDeviceParams(
    @Param('serial') serial: string,
    @Body() params: any,
  ) {
    return this.nengjiaService.updateDeviceParams(serial, params);
  }

  @Public()
  @Get('device/:serial/params')
  getDeviceParams(@Param('serial') serial: string) {
    return this.nengjiaService.getDeviceParams(serial);
  }
}
