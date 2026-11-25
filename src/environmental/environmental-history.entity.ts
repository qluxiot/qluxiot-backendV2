import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('environmental_history')
export class EnvironmentalHistory {
  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn()
  recordedAt: Date;

  @Column('float', { default: 0 })
  temperature: number;

  @Column('float', { default: 0 })
  humidity: number;

  @Column('float', { default: 0 })
  pm25: number;

  @Column('float', { default: 0 })
  pm10: number;

  @Column('float', { default: 0 })
  noise: number;

  @Column('float', { default: 0 })
  pressure: number;

  @Column('float', { default: 0 })
  windSpeed: number;

  @Column('float', { default: 0 })
  windDirection: number;

  @Column('float', { nullable: true })
  co2?: number;
}
