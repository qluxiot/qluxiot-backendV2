import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('notification_channels')
export class NotificationChannel {
  @PrimaryGeneratedColumn()
  id: number;

  /** Display name, e.g. "Boss WhatsApp" */
  @Column()
  name: string;

  /** 'whatsapp' or 'email' */
  @Column()
  channel_type: string;

  /** Phone number or email address */
  @Column()
  channel_address: string;

  /** The project this channel belongs to */
  @Column({ nullable: true })
  project_id: number;

  /** Tracks if the user has clicked the verification link */
  @Column({ default: false })
  is_verified: boolean;

  /** Unique token sent to user for verification; null after verified */
  @Column({ type: 'varchar', nullable: true, unique: true })
  verification_token: string | null;

  /** Allows pausing notifications without deleting the channel */
  @Column({ default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
