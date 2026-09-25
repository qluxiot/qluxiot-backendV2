import { Module } from '@nestjs/common';
import { GuangmangService } from './guangmang.service';
import { GuangmangController } from './guangmang.controller';

@Module({
  controllers: [GuangmangController],
  providers: [GuangmangService],
  exports: [GuangmangService],
})
export class GuangmangModule {}
