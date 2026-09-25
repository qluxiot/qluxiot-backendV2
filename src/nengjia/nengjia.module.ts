import { Module } from '@nestjs/common';
import { NengjiaService } from './nengjia.service';
import { NengjiaController } from './nengjia.controller';

@Module({
  controllers: [NengjiaController],
  providers: [NengjiaService],
  exports: [NengjiaService],
})
export class NengjiaModule {}
