import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { SolarScheduleProfile } from './solar-schedule-profile.entity';
import { Project } from '../../projects/entities/project.entity';

@Entity('solar_devices')
export class SolarDevice {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  serial: string;

  @Column()
  name: string;

  @Column({ default: 'Zhaga4G' })
  device_type: string; // Zhaga4G | ZhagaLora | Nema4G | NemaLora | Gateway

  // Real-time Telemetry (Synced from Nengjia Cloud)
  @Column({ nullable: true, type: 'decimal', precision: 8, scale: 2 })
  battery_power: number;

  @Column({ nullable: true, type: 'decimal', precision: 5, scale: 2 })
  outer_temperature: number;

  @Column({ nullable: true })
  run_day: number;

  @Column({ nullable: true, type: 'decimal', precision: 5, scale: 2 })
  battery_voltage: number;

  @Column({ nullable: true, type: 'decimal', precision: 8, scale: 2 })
  solar_panel_power: number;

  @Column({ nullable: true, type: 'decimal', precision: 8, scale: 2 })
  solar_panel_circuit: number;

  @Column({ nullable: true })
  charge_capacity: number;

  @Column({ nullable: true })
  discharge_capacity: number;

  @Column({ nullable: true, type: 'decimal', precision: 8, scale: 2 })
  led_power: number;

  @Column({ nullable: true, type: 'decimal', precision: 8, scale: 2 })
  battery_circuit: number;

  @Column({ nullable: true })
  is_lighting: number;

  @Column({ nullable: true, type: 'decimal', precision: 5, scale: 2 })
  battery_percent: number;

  @Column({ nullable: true, type: 'decimal', precision: 5, scale: 2 })
  solar_panel_voltage: number;

  @Column({ nullable: true, type: 'decimal', precision: 5, scale: 2 })
  inner_temperature: number;

  @Column({ nullable: true })
  is_online: number;

  @Column({ nullable: true })
  signal_strength: number;

  @Column({ nullable: true, type: 'decimal', precision: 5, scale: 2 })
  led_voltage: number;

  @Column({ nullable: true, type: 'decimal', precision: 8, scale: 2 })
  led_circuit: number;

  @Column({ nullable: true, type: 'decimal', precision: 10, scale: 6 })
  latitude: number;

  @Column({ nullable: true, type: 'decimal', precision: 10, scale: 6 })
  longitude: number;

  @Column({ nullable: true })
  timestamp: string;

  @Column({ type: 'varchar', nullable: true })
  gateway_serial: string | null;

  @Column({ default: 'Active' })
  status: string; // Active, Inactive, Maintenance, Faulty

  @CreateDateColumn({ type: 'timestamptz' })
  created_datetime: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_datetime: Date;

  @ManyToOne(() => SolarScheduleProfile, profile => profile.devices, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'schedule_profile_id' })
  schedule_profile: SolarScheduleProfile | null;

  @ManyToOne(() => Project, { nullable: true, onDelete: 'SET NULL', eager: true })
  @JoinColumn({ name: 'project_id' })
  project: Project | null;
}
