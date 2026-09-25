import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class AppService {
  private readonly logger = new Logger('SystemHealth');

  getHello(): string {
    return 'Qlux IoT System Backend is Running!';
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async handleHealthCheck() {
    try {
      // Fetching our own public Render URL tricks Render into seeing "incoming web traffic"
      // which resets its 15-minute inactivity timer and keeps the server awake 24/7!
      const response = await fetch('https://qluxiot-backend-eh1v.onrender.com/');
      if (response.ok) {
        this.logger.log(`[HEALTH] Ping successful: ${response.status}. Server stays awake!`);
      } else {
        this.logger.warn(`[HEALTH] Ping failed with status: ${response.status}`);
      }
    } catch (error) {
      this.logger.error(`[HEALTH] Ping failed: ${error.message}`);
    }
  }
}
