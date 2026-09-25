import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('led_daily_stats')
@Index(['serial', 'date'], { unique: true })
export class LedDailyStats {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 100 })
  serial: string;

  @Column({ type: 'int', nullable: true })
  projectId: number | null;

  @Column({ type: 'date' })
  date: string; // YYYY-MM-DD

  // Total power consumed today in kWh
  @Column({ type: 'decimal', precision: 10, scale: 4, default: 0 })
  powerConsumptionKWh: number;

  // Estimated electricity cost today in RM
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  estimatedCostRM: number;

  // Energy saved compared to traditional lamps in kWh
  @Column({ type: 'decimal', precision: 10, scale: 4, default: 0 })
  energySavedKWh: number;

  // Cost saved compared to traditional lamps in RM
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  costSavedRM: number;

  // CO2 prevented today in Kg
  @Column({ type: 'decimal', precision: 10, scale: 4, default: 0 })
  co2PreventedKg: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
