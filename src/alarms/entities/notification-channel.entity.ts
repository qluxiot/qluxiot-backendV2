import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('notification_channels')
export class NotificationChannel {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string; // e.g. "Main WhatsApp"

  @Column()
  channel_type: string; // 'whatsapp', 'telegram', 'email'

  @Column()
  channel_address: string; // e.g. '+60123456789' or 'chat_id'

  @Column({ default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
