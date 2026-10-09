import { Module } from '@nestjs/common';
import { CctvService } from './cctv.service';
import { CctvController } from './cctv.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [CctvController],
  providers: [CctvService],
  exports: [CctvService],
})
export class CctvModule {}
