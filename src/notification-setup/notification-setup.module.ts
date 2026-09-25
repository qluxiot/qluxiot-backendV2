import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { WhatsappController } from './whatsapp/whatsapp.controller';
import { WhatsappService } from './whatsapp/whatsapp.service';
import { EmailService } from './email/email.service';
import { ChannelsService } from './services/channels.service';
import { ChannelsController } from './controllers/channels.controller';
import { NotificationChannel } from './entities/notification-channel.entity';
import { WhatsappAuth } from './entities/whatsapp-auth.entity';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([NotificationChannel, WhatsappAuth]),
  ],
  controllers: [WhatsappController, ChannelsController],
  providers: [WhatsappService, EmailService, ChannelsService],
  exports: [WhatsappService, EmailService, ChannelsService],
})
export class NotificationSetupModule {}

