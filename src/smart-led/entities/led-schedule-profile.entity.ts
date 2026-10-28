
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany, ManyToOne, JoinColumn } from 'typeorm';
import { LedDevice } from './led-device.entity';
import { User } from '../../users/entities/user.entity';

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

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL', eager: true })
  @JoinColumn({ name: 'created_by_id' })
  created_by: User | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL', eager: true })
  @JoinColumn({ name: 'updated_by_id' })
  updated_by: User | null;

  @OneToMany(() => LedDevice, device => device.schedule_profile)
  devices: LedDevice[];
}
