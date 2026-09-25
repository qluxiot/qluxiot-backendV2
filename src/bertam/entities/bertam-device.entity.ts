import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('bertam_devices')
export class BertamDevice {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  dev_eui: string; // Device EUI from Isurian MQTT

  @Column({ nullable: true })
  gateway_id: string;

  @Column({ nullable: true })
  name: string; // Friendly display name

  @Column({ default: 'Unassigned' })
  site_name: string;

  @Column({ nullable: true, type: 'decimal', precision: 10, scale: 6 })
  latitude: number;

  @Column({ nullable: true, type: 'decimal', precision: 10, scale: 6 })
  longitude: number;

  // ── Latest Telemetry (updated live from MQTT) ──────────────────────────────
  @Column({ nullable: true, type: 'decimal', precision: 10, scale: 2 })
  rssi: number;

  @Column({ nullable: true, type: 'decimal', precision: 10, scale: 2 })
  snr: number;

  /** modbus_chn_1 – Alarm 1 */
  @Column({ nullable: true })
  alarm1: number;

  /** modbus_chn_2 – Battery % */
  @Column({ nullable: true, type: 'decimal', precision: 10, scale: 2 })
  battery_percent: number;

  /** modbus_chn_3 – Battery Voltage (V) */
  @Column({ nullable: true, type: 'decimal', precision: 10, scale: 2 })
  battery_voltage: number;

  /** modbus_chn_4 – Solar Panel Voltage (V) */
  @Column({ nullable: true, type: 'decimal', precision: 10, scale: 2 })
  solar_panel_voltage: number;

  /** modbus_chn_5 – Solar Current (mA) */
  @Column({ nullable: true, type: 'decimal', precision: 10, scale: 2 })
  solar_current: number;

  /** modbus_chn_6 – Charge (Ah) */
  @Column({ nullable: true, type: 'decimal', precision: 10, scale: 2 })
  charge: number;

  /** modbus_chn_7 – Max Charge (Ah) */
  @Column({ nullable: true, type: 'decimal', precision: 10, scale: 2 })
  max_charge: number;

  /** modbus_chn_8 – Consumption (W) */
  @Column({ nullable: true, type: 'decimal', precision: 10, scale: 2 })
  consumption: number;

  /** modbus_chn_9 – Brightness (%) */
  @Column({ nullable: true })
  brightness_mode: number;

  /** modbus_chn_10 – LED Status (0=OFF, >0=ON) */
  @Column({ nullable: true })
  led_status: number;

  /** modbus_chn_11 – Battery Temperature (°C) */
  @Column({ nullable: true, type: 'decimal', precision: 10, scale: 2 })
  battery_temp: number;

  /** modbus_chn_12 – Brightness code (58368=100%, 48128=60%, 43008=40%) */
  @Column({ nullable: true })
  brightness_code: number;

  /** modbus_chn_13 – Alarm 2 */
  @Column({ nullable: true })
  alarm2: number;

  /** modbus_chn_14 – Brightness 100% duration (seconds) */
  @Column({ nullable: true })
  duration_100: number;

  /** modbus_chn_15 – Brightness 40% duration (seconds) */
  @Column({ nullable: true })
  duration_40: number;

  /** modbus_chn_16 – Brightness 60% duration (seconds) */
  @Column({ nullable: true })
  duration_60: number;

  @Column({ nullable: true })
  timestamp: string; // ISO timestamp from MQTT payload

  @Column({ default: 1 })
  is_online: number; // 1=online, 0=offline

  @Column({ default: 'Active' })
  status: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_datetime: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_datetime: Date;
}
