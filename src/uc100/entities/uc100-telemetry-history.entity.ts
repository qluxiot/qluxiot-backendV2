import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('uc100_telemetry_history')
@Index(['dev_eui', 'timestamp'])
export class Uc100TelemetryHistory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  @Index()
  dev_eui: string;

  @Column({ nullable: true, type: 'decimal', precision: 10, scale: 2 })
  battery_percent: number;

  @Column({ nullable: true, type: 'decimal', precision: 10, scale: 2 })
  battery_voltage: number;

  @Column({ nullable: true, type: 'decimal', precision: 10, scale: 2 })
  solar_panel_voltage: number;

  @Column({ nullable: true, type: 'decimal', precision: 10, scale: 2 })
  solar_current: number;

  @Column({ nullable: true, type: 'decimal', precision: 10, scale: 2 })
  charge: number;

  @Column({ nullable: true, type: 'decimal', precision: 10, scale: 2 })
  consumption: number;

  @Column({ nullable: true })
  led_status: number;

  @Column({ nullable: true })
  brightness_setting: number;

  @Column({ nullable: true })
  brightness_actual: number;

  @Column({ nullable: true, type: 'decimal', precision: 10, scale: 2 })
  battery_temp: number;

  @Column({ nullable: true, type: 'decimal', precision: 10, scale: 2 })
  rssi: number;

  @Column({ nullable: true, type: 'decimal', precision: 10, scale: 2 })
  snr: number;

  @Column()
  timestamp: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_datetime: Date;
}
