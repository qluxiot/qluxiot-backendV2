import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('telemetry_history')
@Index(['serial', 'timestamp']) // Index for fast time-series queries
export class TelemetryHistory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  @Index()
  serial: string;

  // Real-time Telemetry Values
  @Column({ nullable: true, type: 'decimal', precision: 8, scale: 2 })
  battery_power: number;

  @Column({ nullable: true, type: 'decimal', precision: 5, scale: 2 })
  outer_temperature: number;

  @Column({ nullable: true, type: 'decimal', precision: 5, scale: 2 })
  battery_voltage: number;

  @Column({ nullable: true, type: 'decimal', precision: 8, scale: 2 })
  solar_panel_power: number;

  @Column({ nullable: true, type: 'decimal', precision: 8, scale: 2 })
  solar_panel_circuit: number; // Current

  @Column({ nullable: true, type: 'decimal', precision: 8, scale: 2 })
  led_power: number;

  @Column({ nullable: true, type: 'decimal', precision: 8, scale: 2 })
  battery_circuit: number; // Current

  @Column({ nullable: true, type: 'decimal', precision: 5, scale: 2 })
  battery_percent: number;

  @Column({ nullable: true, type: 'decimal', precision: 5, scale: 2 })
  solar_panel_voltage: number;

  @Column({ nullable: true, type: 'decimal', precision: 5, scale: 2 })
  inner_temperature: number;

  @Column({ nullable: true, type: 'decimal', precision: 5, scale: 2 })
  led_voltage: number;

  @Column({ nullable: true, type: 'decimal', precision: 8, scale: 2 })
  led_circuit: number; // Current

  @Column()
  timestamp: string; // The time Nengjia recorded this data

  @CreateDateColumn({ type: 'timestamptz' })
  created_datetime: Date; // When our system saved it
}
