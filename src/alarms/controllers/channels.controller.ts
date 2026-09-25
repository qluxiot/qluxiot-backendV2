import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common';
import { ChannelsService } from '../services/channels.service';
import { NotificationChannel } from '../entities/notification-channel.entity';

@Controller('api/notification-channels')
export class ChannelsController {
  constructor(private readonly channelsService: ChannelsService) {}

  @Get()
  findAll() {
    return this.channelsService.findAll();
  }

  @Post()
  create(@Body() data: Partial<NotificationChannel>) {
    return this.channelsService.create(data);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() data: Partial<NotificationChannel>) {
    return this.channelsService.update(Number(id), data);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.channelsService.remove(Number(id));
  }
}
