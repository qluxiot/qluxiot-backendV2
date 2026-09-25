import {
  Controller, Get, Post, Put, Delete,
  Body, Param, Query, Res, Req
} from '@nestjs/common';
import type { Response, Request } from 'express';
import { ChannelsService } from '../services/channels.service';
import { NotificationChannel } from '../entities/notification-channel.entity';
import { Public } from '../../auth/public.decorator';

@Controller('api/notification-channels')
export class ChannelsController {
  constructor(private readonly channelsService: ChannelsService) {}

  @Get()
  findAll(@Query('projectId') projectId: string | undefined, @Req() req: Request) {
    const user = (req as any)['user'];
    // If user has a project (normal user), force-scope to their project only
    if (user?.projectId) {
      return this.channelsService.findAll(Number(user.projectId));
    }
    // Admin: use query param (or all if none)
    return this.channelsService.findAll(projectId ? Number(projectId) : undefined);
  }

  @Post()
  create(@Body() data: Partial<NotificationChannel>, @Req() req: Request) {
    const user = (req as any)['user'];
    // Force the user's project onto the channel if they are a normal user
    if (user?.projectId) {
      data.project_id = Number(user.projectId);
    }
    return this.channelsService.create(data);
  }

  /**
   * Public endpoint — user clicks verification link from WhatsApp/Email.
   * Returns a simple HTML success/failure page.
   */
  @Public()
  @Get('verify')
  async verify(@Query('token') token: string, @Res() res: Response) {
    try {
      const channel = await this.channelsService.verifyChannel(token);
      return res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
          <title>Channel Verified - Qlux IoT</title>
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body {
              font-family: 'Segoe UI', Arial, sans-serif;
              display: flex; justify-content: center; align-items: center;
              min-height: 100vh; background: linear-gradient(135deg, #f0fdf4, #dcfce7);
            }
            .card {
              background: white; border-radius: 20px; padding: 48px 40px;
              text-align: center; box-shadow: 0 8px 40px rgba(0,0,0,0.10);
              max-width: 460px; width: 90%;
            }
            .icon { font-size: 72px; margin-bottom: 20px; }
            h1 { color: #166534; margin-bottom: 12px; font-size: 26px; }
            .desc { color: #475569; font-size: 15px; line-height: 1.6; margin-bottom: 8px; }
            .badge {
              display: inline-block; background: #dcfce7; color: #166534;
              padding: 6px 20px; border-radius: 100px; font-weight: 600;
              font-size: 14px; margin-top: 12px;
            }
            .footer { margin-top: 28px; color: #94a3b8; font-size: 13px; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="icon">✅</div>
            <h1>Channel Verified!</h1>
            <p class="desc">Your notification channel <strong>${channel.name}</strong> has been successfully verified.</p>
            <p class="desc">You will now receive Qlux IoT alerts via <strong>${channel.channel_type}</strong>.</p>
            <span class="badge">${channel.channel_address}</span>
            <p class="footer">You can close this tab and return to the Qlux app.</p>
          </div>
        </body>
        </html>
      `);
    } catch (err) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <title>Verification Failed - Qlux IoT</title>
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body {
              font-family: 'Segoe UI', Arial, sans-serif;
              display: flex; justify-content: center; align-items: center;
              min-height: 100vh; background: linear-gradient(135deg, #fef2f2, #fecaca);
            }
            .card {
              background: white; border-radius: 20px; padding: 48px 40px;
              text-align: center; box-shadow: 0 8px 40px rgba(0,0,0,0.10);
              max-width: 460px; width: 90%;
            }
            .icon { font-size: 72px; margin-bottom: 20px; }
            h1 { color: #991b1b; margin-bottom: 12px; font-size: 26px; }
            p { color: #475569; font-size: 15px; line-height: 1.6; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="icon">❌</div>
            <h1>Verification Failed</h1>
            <p>The verification link is invalid or has already been used.</p>
            <p style="margin-top: 12px;">Please go back to the Qlux app and try again.</p>
          </div>
        </body>
        </html>
      `);
    }
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
