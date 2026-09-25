import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('solar_daily_stats')
@Index(['serial', 'date'], { unique: true })
export class SolarDailyStats {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 100 })
  serial: string;

  @Column({ type: 'int', nullable: true })
  projectId: number | null;

  @Column({ type: 'date' })
  date: string; // YYYY-MM-DD

  // Total energy generated today in kWh
  @Column({ type: 'decimal', precision: 10, scale: 4, default: 0 })
  energyGeneratedKWh: number;

  // Total money saved today in RM
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  moneySavedRM: number;

  // Total CO2 prevented today in Kg
  @Column({ type: 'decimal', precision: 10, scale: 4, default: 0 })
  co2PreventedKg: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
