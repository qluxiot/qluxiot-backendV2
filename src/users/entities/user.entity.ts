import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Project } from '../../projects/entities/project.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  username: string;

  @Column({ nullable: true })
  name: string;

  @Column()
  password: string;

  @Column({ type: 'varchar', default: 'Admin' })
  userRole: string;

  // null = Admin (sees all projects), set = scoped to that project
  @ManyToOne(() => Project, { nullable: true, onDelete: 'SET NULL', eager: true })
  @JoinColumn({ name: 'project_id' })
  project: Project | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdDatetime: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedDatetime: Date;
}

