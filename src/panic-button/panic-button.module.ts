import { Module } from '@nestjs/common';
import { PanicButtonController } from './panic-button.controller';
import { PanicButtonService } from './panic-button.service';

@Module({
  controllers: [PanicButtonController],
  providers: [PanicButtonService],
  exports: [PanicButtonService],
})
export class PanicButtonModule {}
