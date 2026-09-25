import { Controller, Get, Param, Query, Post, Body, Delete } from '@nestjs/common';
import { GuangmangService } from './guangmang.service';
import { Public } from '../auth/public.decorator';

@Controller('guangmang')
export class GuangmangController {
  constructor(private readonly guangmangService: GuangmangService) {}

  @Public()
  @Get('devices')
  getDevices(
    @Query('page') page?: string,
    @Query('size') size?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const pageSize = size ? parseInt(size, 10) : 50;
    return this.guangmangService.getDeviceList(pageNum, pageSize);
  }

  @Public()
  @Get('gateways')
  getGateways(
    @Query('page') page?: string,
    @Query('size') size?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const pageSize = size ? parseInt(size, 10) : 50;
    return this.guangmangService.getGatewayList(pageNum, pageSize);
  }

  @Public()
  @Get('assets/gateways')
  getAssetGateways(
    @Query('page') page?: string,
    @Query('size') size?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const pageSize = size ? parseInt(size, 10) : 50;
    return this.guangmangService.getAssetGateways(pageNum, pageSize);
  }

  @Public()
  @Get('assets/devices')
  getAssetDevices(
    @Query('page') page?: string,
    @Query('size') size?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const pageSize = size ? parseInt(size, 10) : 50;
    return this.guangmangService.getAssetDevices(pageNum, pageSize);
  }

  @Public()
  @Get('device/:serial/poll')
  pollDevice(@Param('serial') serial: string) {
    return this.guangmangService.forcePollDeviceStatus(serial);
  }

  @Public()
  @Post('device/:serial/light')
  controlLight(
    @Param('serial') serial: string,
    @Body('power') power: number,
  ) {
    return this.guangmangService.adjustLight(serial, power);
  }
  @Public()
  @Delete('gateway/:serial')
  async deleteGateway(@Param('serial') serial: string) {
    const list = await this.guangmangService.getAssetGateways(1, 1000);
    const item = list.find((g: any) => g.equipmentNum === serial || g.equipmentId === serial);
    if (!item) return { success: false, message: 'Gateway not found in Guangmang Cloud Assets' };
    return this.guangmangService.deleteGateway(item.equipmentId);
  }

  @Public()
  @Delete('device/:serial')
  async deleteDevice(@Param('serial') serial: string) {
    const list = await this.guangmangService.getAssetDevices(1, 1000);
    const item = list.find((g: any) => g.equipmentNum === serial || g.equipmentId === serial);
    if (!item) return { success: false, message: 'Device not found in Guangmang Cloud Assets' };
    return this.guangmangService.deleteStreetLight(item.equipmentId);
  }
}
