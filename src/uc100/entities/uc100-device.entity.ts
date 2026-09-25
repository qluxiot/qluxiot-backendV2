import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { Project } from '../../projects/entities/project.entity';

@Entity('uc100_devices')
export class Uc100Device {
  @PrimaryGeneratedColumn()
  id: number;

  /** Device EUI from HiveMQ payload */
  @Column({ unique: true })
  @Index()
  dev_eui: string;

  /** Friendly display name (can be edited by user) */
  @Column({ nullable: true })
  name: string;

  /** applicationID from HiveMQ payload */
  @Column({ nullable: true })
  application_id: number;

  @Column({ nullable: true })
  gateway_id: string;

  @Column({ nullable: true, type: 'decimal', precision: 10, scale: 6 })
  latitude: number;

  @Column({ nullable: true, type: 'decimal', precision: 10, scale: 6 })
  longitude: number;

  @Column({ nullable: true })
  location_name: string;

  /** Project binding — mirrors Smart Solar / Bertam pattern */
  @Column({ nullable: true })
  project_id: number;

  @ManyToOne(() => Project, { nullable: true, onDelete: 'SET NULL', eager: true })
  @JoinColumn({ name: 'project_id' })
  project: Project | null;

  // ── Signal Quality ─────────────────────────────────────────────────────────
  @Column({ nullable: true, type: 'decimal', precision: 10, scale: 2 })
  rssi: number;

  @Column({ nullable: true, type: 'decimal', precision: 10, scale: 2 })
  snr: number;

  // ── Latest Telemetry (updated live from MQTT) ──────────────────────────────

  /** modbus_chn_1 – Alarm Info 1 */
  @Column({ nullable: true })
  alarm1: number;

  /** modbus_chn_2 – Battery SOC (%) */
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

  /** modbus_chn_6 – Charging Accumulated (Ah) */
  @Column({ nullable: true, type: 'decimal', precision: 10, scale: 2 })
  charge: number;

  /** modbus_chn_7 – Max Charge (Ah) */
  @Column({ nullable: true, type: 'decimal', precision: 10, scale: 2 })
  max_charge: number;

  /** modbus_chn_8 – Energy Consumption (Wh) */
  @Column({ nullable: true, type: 'decimal', precision: 10, scale: 2 })
  consumption: number;

  /** modbus_chn_9 – Brightness Setting (%) — WRITABLE via downlink */
  @Column({ nullable: true })
  brightness_setting: number;

  /** modbus_chn_10 – LED/Load Status (0=OFF, >0=ON) — WRITABLE via downlink */
  @Column({ nullable: true })
  led_status: number;

  /** modbus_chn_11 – Battery Temperature (°C) */
  @Column({ nullable: true, type: 'decimal', precision: 10, scale: 2 })
  battery_temp: number;

  /** modbus_chn_12 – Actual Brightness Code (raw value from controller) */
  @Column({ nullable: true })
  brightness_actual: number;

  /** modbus_chn_13 – Alarm Info 2 */
  @Column({ nullable: true })
  alarm2: number;

  /** modbus_chn_14 – Timer 1 duration (seconds) — WRITABLE via downlink */
  @Column({ nullable: true })
  timer_1: number;

  /** modbus_chn_15 – Timer 2 duration (seconds) — WRITABLE via downlink */
  @Column({ nullable: true })
  timer_2: number;

  /** modbus_chn_16 – Timer 3 duration (seconds) — WRITABLE via downlink */
  @Column({ nullable: true })
  timer_3: number;

  /** modbus_chn_9 – Timer 1 Dimming (%) — WRITABLE via downlink */
  @Column({ nullable: true })
  timer_1_dim: number;

  /** modbus_chn_17 – Timer 2 Dimming (%) — WRITABLE via downlink */
  @Column({ nullable: true })
  timer_2_dim: number;

  /** modbus_chn_18 – Timer 3 Dimming (%) — WRITABLE via downlink */
  @Column({ nullable: true })
  timer_3_dim: number;

  @Column({ nullable: true })
  timestamp: string;

  @Column({ default: 1 })
  is_online: number; // 1=online, 0=offline

  @Column({ default: 'Active' })
  status: string; // Active, Inactive, Maintenance, Faulty

  @CreateDateColumn({ type: 'timestamptz' })
  created_datetime: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_datetime: Date;
}
