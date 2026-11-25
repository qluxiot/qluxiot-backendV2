import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface CctvCamera {
  id: number;
  name: string;
  location: string;
  poleId: string;
  projectId?: number | null;
  projectName?: string;
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
    const defaultStreamUrl = this.configService.get<string>('CCTV_DEFAULT_STREAM_URL') || 'https://mortgage-engaged-transmission-rep.trycloudflare.com/cctv_main/';

    return [
      {
        id: 1,
        name: 'Live CCTV Feed',
        location: 'Qlux Smart Pole SP-001',
        poleId: 'SP-001',
        projectId: null, // Assigned to Qlux Device or All
        projectName: 'Qlux Device',
        isOnline: true,
        resolution: '720p HD',
        fps: 15,
        detectionEnabled: false,
        lastMotion: '-',
        motionCount: 0,
        recordingStatus: 'standby',
        thumbnailGradient: 'linear-gradient(135deg, #0f2027, #203a43, #2c5364)',
        overlayColor: '#10b981',
        streamUrl: defaultStreamUrl,
      }
    ];
  }
}
