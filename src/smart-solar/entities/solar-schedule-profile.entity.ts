import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { SolarDevice } from './solar-device.entity';

@Entity('solar_schedule_profiles')
export class SolarScheduleProfile {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ type: 'jsonb', default: [] })
  rules: any;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  @OneToMany(() => SolarDevice, device => device.schedule_profile)
  devices: SolarDevice[];
}
