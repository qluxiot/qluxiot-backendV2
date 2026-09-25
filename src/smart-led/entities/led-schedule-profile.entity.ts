
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { LedDevice } from './led-device.entity';

@Entity('led_schedule_profiles')
export class LedScheduleProfile {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  // Store the schedule rules as a JSON object
  // Example: [{ time: '19:00', action: 'ON', brightness: 100 }, { time: '00:00', action: 'DIM', brightness: 50 }, { time: '06:00', action: 'OFF' }]
  @Column({ type: 'jsonb', default: [] })
  rules: any;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  @OneToMany(() => LedDevice, device => device.schedule_profile)
  devices: LedDevice[];
}
