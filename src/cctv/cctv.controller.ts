import { Controller, Get, UseGuards } from '@nestjs/common';
import { CctvService } from './cctv.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('cctv')
@UseGuards(JwtAuthGuard)
export class CctvController {
  constructor(private readonly cctvService: CctvService) {}

  @Get('cameras')
  getCameras() {
    return this.cctvService.getCameras();
  }
}
