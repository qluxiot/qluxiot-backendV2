import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import * as bcrypt from 'bcrypt';

const BCRYPT_ROUNDS = 10;

@Injectable()
export class UsersService implements OnModuleInit {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  async onModuleInit() {
    // Seed initial admin user if the table is empty
    const count = await this.usersRepository.count();
    if (count === 0) {
      const user = new User();
      user.username = 'qluxgroup';
      user.name = 'QLUX Admin';
      // Hash the password before seeding — never store plain text
      user.password = await bcrypt.hash('qluxgroup', BCRYPT_ROUNDS);
      user.userRole = 'Admin';
      await this.usersRepository.save(user);
      console.log('Seeded initial admin user: qluxgroup (password hashed)');
    }
  }

  findAll(): Promise<User[]> {
    return this.usersRepository.find({ relations: { project: true } });
  }

  findOne(id: number): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id }, relations: { project: true } });
  }

  findByUsername(username: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { username }, relations: { project: true } });
  }

  async create(body: any): Promise<User> {
    const { projectId, password, ...rest } = body;
    const newUser = this.usersRepository.create(rest as Partial<User>);

    // Hash the password before saving
    if (password) {
      (newUser as any).password = await bcrypt.hash(password, BCRYPT_ROUNDS);
    }

    if (projectId) {
      (newUser as any).project = { id: projectId };
    } else {
      (newUser as any).project = null;
    }
    return this.usersRepository.save(newUser as User);
  }

  async update(id: number, body: any): Promise<User | null> {
    const existing = await this.findOne(id);
    if (!existing) return null;

    // Explicit field allowlist — prevents mass-assignment attacks
    // Users cannot inject arbitrary fields (e.g., sneaking 'userRole: Admin')
    const { username, name, userRole, projectId, password } = body;

    if (username !== undefined) existing.username = username;
    if (name !== undefined) existing.name = name;
    if (userRole !== undefined) existing.userRole = userRole;

    // Only re-hash if a new password was explicitly provided
    if (password) {
      existing.password = await bcrypt.hash(password, BCRYPT_ROUNDS);
    }

    if (projectId !== undefined) {
      (existing as any).project = projectId ? { id: projectId } : null;
    }

    return this.usersRepository.save(existing);
  }

  async remove(id: number): Promise<void> {
    await this.usersRepository.delete(id);
  }
}

