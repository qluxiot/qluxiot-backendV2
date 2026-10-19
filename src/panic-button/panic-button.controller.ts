import { Controller, Get, Post, Body } from '@nestjs/common';
import { PanicButtonService } from './panic-button.service';
import { Public } from '../auth/public.decorator';

@Controller('api/panic-button')
export class PanicButtonController {
  constructor(private readonly panicButtonService: PanicButtonService) {}

  @Public()
  @Get('devices')
  getDevices() {
    return this.panicButtonService.getDevices();
  }

  @Public()
  @Get('live')
  getLive() {
    return this.panicButtonService.getLive();
  }

  @Public()
  @Post('trigger')
  triggerAlarm(@Body() body: { pressedBy?: string }) {
    return this.panicButtonService.triggerAlarm(body?.pressedBy || 'Physical SOS Hardware Button');
  }

  @Public()
  @Post('dismiss')
  dismissAlarm(@Body() body: { operatorName?: string }) {
    return this.panicButtonService.dismissAlarm(body?.operatorName || 'Operator');
  }
}
