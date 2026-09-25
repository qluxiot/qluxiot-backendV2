import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('led_telemetry_history')
export class LedTelemetryHistory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  serial: string;

  @Column({ type: 'float', nullable: true })
  voltage: number;

  @Column({ type: 'float', nullable: true })
  current: number;

  @Column({ type: 'float', nullable: true })
  active_power: number;

  @Column({ type: 'float', nullable: true })
  total_active_power: number; // Cumulative kWh

  @Column({ type: 'int', nullable: true })
  brightness: number;

  @Column({ type: 'int', nullable: true })
  brightness2: number;

  @Column({ type: 'bigint', nullable: true })
  timestamp: number;

  @CreateDateColumn({ type: 'timestamptz' })
  created_datetime: Date;
}
