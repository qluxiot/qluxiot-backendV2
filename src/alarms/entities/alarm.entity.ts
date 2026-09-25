import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('alarms')
export class Alarm {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  serial: string;

  @Column({ nullable: true })
  name: string;

  @Column({ nullable: true })
  device_type: string; // 'solar' or 'led'

  @Column({ nullable: true })
  warning_information: string;

  @Column({ nullable: true })
  english: string;

  @Column({ default: 0 })
  is_handle: number; // 0 for unhandled, 1 for handled

  @Column({ type: 'date', nullable: true })
  date: string; // YYYY-MM-DD

  @Column({ type: 'time', nullable: true })
  time: string; // HH:mm:ss

  @Column({ type: 'int', nullable: true })
  project_id: number | null; // Which project this alarm belongs to

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
