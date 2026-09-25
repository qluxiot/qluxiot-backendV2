import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { NotificationChannel } from '../entities/notification-channel.entity';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { EmailService } from '../email/email.service';

@Injectable()
export class ChannelsService {
  private readonly logger = new Logger(ChannelsService.name);

  constructor(
    @InjectRepository(NotificationChannel)
    private readonly channelRepo: Repository<NotificationChannel>,
    private readonly whatsappService: WhatsappService,
    private readonly emailService: EmailService,
    private readonly config: ConfigService,
  ) {}

  async findAll(projectId?: number) {
    const where = projectId ? { project_id: projectId } : {};
    return this.channelRepo.find({ where, order: { created_at: 'DESC' } });
  }

  async create(data: Partial<NotificationChannel>) {
    if (!data.channel_type || !data.channel_address) {
      throw new BadRequestException('channel_type and channel_address are required');
    }

    const existingChannel = await this.channelRepo.findOne({
      where: {
        channel_address: data.channel_address,
        project_id: data.project_id ?? IsNull(),
      },
    });

    if (existingChannel) {
      throw new BadRequestException(
        `This ${data.channel_type === 'whatsapp' ? 'phone number' : 'email'} is already registered for this project.`
      );
    }

    if (data.channel_type === 'whatsapp') {
      if (!data.channel_address.startsWith('+60')) {
        throw new BadRequestException('WhatsApp number must start with +60');
      }
    } else if (data.channel_type === 'email') {
      const email = data.channel_address;
      const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      if (!emailRegex.test(email)) {
        throw new BadRequestException('Email must be a valid email address');
      }
    }

    const token = randomUUID();
    const channel = this.channelRepo.create({
      ...data,
      is_verified: false,
      verification_token: token,
    });
    const saved = await this.channelRepo.save(channel);

    const baseUrl = this.config.get<string>('BACKEND_URL') || 'http://localhost:3000';
    const verifyUrl = `${baseUrl}/api/notification-channels/verify?token=${token}`;

    // Send verification message based on channel type
    try {
      if (data.channel_type === 'whatsapp') {
        const msg =
          `👋 *Qlux IoT - Verify Your Channel*\n\n` +
          `Hi! You registered *${data.name}* as a WhatsApp notification channel.\n\n` +
          `Please click the link below to verify your number and start receiving alerts:\n\n` +
          `🔗 ${verifyUrl}\n\n` +
          `_If you did not request this, please ignore this message._`;
        await this.whatsappService.sendMessage(data.channel_address, msg);
        this.logger.log(`✅ WhatsApp verification sent to ${data.channel_address}`);
      } else if (data.channel_type === 'email') {
        await this.emailService.sendVerificationEmail(data.channel_address, data.name ?? 'Unnamed Channel', verifyUrl);
        this.logger.log(`✅ Email verification sent to ${data.channel_address}`);
      }
    } catch (err) {
      this.logger.error(`❌ Failed to send verification for channel ${saved.id}: ${err.message}`);
      // Do NOT throw — channel is saved, verification failure is non-blocking
    }

    return saved;
  }

  async verifyChannel(token: string) {
    const channel = await this.channelRepo.findOne({ where: { verification_token: token } });
    if (!channel) {
      throw new NotFoundException('Invalid or expired verification token.');
    }
    channel.is_verified = true;
    channel.verification_token = null;
    await this.channelRepo.save(channel);
    return channel;
  }

  async update(id: number, data: Partial<NotificationChannel>) {
    const channel = await this.channelRepo.findOne({ where: { id } });
    if (!channel) throw new NotFoundException('Channel not found');
    Object.assign(channel, data);
    return this.channelRepo.save(channel);
  }

  async remove(id: number) {
    const channel = await this.channelRepo.findOne({ where: { id } });
    if (!channel) throw new NotFoundException('Channel not found');
    await this.channelRepo.remove(channel);
    return { success: true };
  }
}
