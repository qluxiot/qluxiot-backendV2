export interface PanicButtonDevice {
  id: number;
  name: string;
  poleId: string;
  serialNumber: string;
  ipAddress: string;
  macAddress: string;
  location: string;
  status: 'standby' | 'active' | 'offline';
  isOnline: boolean;
  battery: number;
  lastPressed: string;
  pressedBy: string | null;
  responseTime: string | null;
  incidentCount: number;
  lastChecked: string;
  signalStrength: number;
  rtspUrl?: string;
  webrtcUrl?: string;
}

export interface PanicButtonEvent {
  id: string;
  timestamp: string;
  deviceIp: string;
  serialNumber: string;
  poleId: string;
  eventType: 'SOS_PRESSED' | 'ALARM_DISMISSED' | 'STATUS_CHANGE';
  details?: string;
}
