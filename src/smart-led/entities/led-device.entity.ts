import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { LedScheduleProfile } from './led-schedule-profile.entity';
import { Project } from '../../projects/entities/project.entity';

@Entity('led_devices')
export class LedDevice {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  serial: string;

  @Column({ nullable: true })
  name: string;

  @Column({ default: 'Nema4G' })
  device_type: string; // Zhaga4G | ZhagaLora | Nema4G | NemaLora | Gateway

  @Column({ default: 'Active' })
  status: string;

  @Column({ type: 'float', nullable: true })
  latitude: number;

  @Column({ type: 'float', nullable: true })
  longitude: number;

  @ManyToOne(() => Project, { nullable: true, onDelete: 'SET NULL', eager: true })
  @JoinColumn({ name: 'project_id' })
  project: Project | null;

  @Column({ type: 'varchar', nullable: true })
  gateway_serial: string | null;

  // Real-time API telemetry cache
  @Column({ type: 'int', default: 0 })
  is_online: number;

  @Column({ type: 'int', default: 0 })
  signal_strength: number;

  @Column({ type: 'int', default: 0 })
  is_lighting: number;

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
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  @ManyToOne(() => LedScheduleProfile, profile => profile.devices, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'schedule_profile_id' })
  schedule_profile: LedScheduleProfile | null;
}
