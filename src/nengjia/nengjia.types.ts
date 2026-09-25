export type LightAction = 'on' | 'off' | 'dim';

export interface NengjiaResponse<T> {
  code: number;
  msg: string;
  data: T;
}

export interface NengjiaDevice {
  serial: string;
  name?: string;
  status?: string;
  [key: string]: any;
}
