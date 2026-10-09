import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface CctvCamera {
  id: number;
  name: string;
  location: string;
  poleId: string;
  isOnline: boolean;
  resolution: string;
  fps: number;
  detectionEnabled: boolean;
  lastMotion: string;
  motionCount: number;
  recordingStatus: 'recording' | 'standby' | 'offline';
  thumbnailGradient: string;
  overlayColor: string;
  streamUrl?: string;
}

@Injectable()
export class CctvService {
  constructor(private configService: ConfigService) {}

  getCameras(): CctvCamera[] {
    const defaultStreamUrl = this.configService.get<string>('CCTV_DEFAULT_STREAM_URL') || 'http://localhost:8889/cctv_main/';

    return [
      {
        id: 1,
        name: 'Live CCTV Feed',
        location: 'Main Location',
        poleId: 'SP-Main',
        isOnline: true,
        resolution: '1080p HD',
        fps: 30,
        detectionEnabled: false,
        lastMotion: '-',
        motionCount: 0,
        recordingStatus: 'recording',
        thumbnailGradient: 'linear-gradient(135deg, #0f2027, #203a43, #2c5364)',
        overlayColor: '#10b981',
        streamUrl: defaultStreamUrl,
      }
    ];
  }
}
