import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationChannel } from '../entities/notification-channel.entity';

@Injectable()
export class ChannelsService {
  constructor(
    @InjectRepository(NotificationChannel)
    private readonly channelRepo: Repository<NotificationChannel>,
  ) {}

  async findAll() {
    return this.channelRepo.find({ order: { created_at: 'DESC' } });
  }

  async create(data: Partial<NotificationChannel>) {
    const channel = this.channelRepo.create(data);
    return this.channelRepo.save(channel);
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
