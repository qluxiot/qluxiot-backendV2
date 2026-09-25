import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from './entities/role.entity';

@Injectable()
export class RolesService implements OnModuleInit {
  constructor(
    @InjectRepository(Role)
    private rolesRepository: Repository<Role>,
  ) {}

  async onModuleInit() {
    const count = await this.rolesRepository.count();
    if (count === 0) {
      const adminRole = this.rolesRepository.create({ name: 'Admin', description: 'Administrator role' });
      const userRole = this.rolesRepository.create({ name: 'User', description: 'Standard user role' });
      await this.rolesRepository.save([adminRole, userRole]);
      console.log('Seeded initial roles: Admin, User');
    }
  }

  findAll(): Promise<Role[]> {
    return this.rolesRepository.find();
  }

  findOne(id: number): Promise<Role | null> {
    return this.rolesRepository.findOneBy({ id });
  }

  async findByName(name: string): Promise<Role | null> {
    return this.rolesRepository.findOneBy({ name });
  }

  async create(role: Partial<Role>): Promise<Role> {
    const newRole = this.rolesRepository.create(role);
    return this.rolesRepository.save(newRole);
  }

  async update(id: number, updateRole: Partial<Role>): Promise<Role | null> {
    await this.rolesRepository.update(id, updateRole);
    return this.rolesRepository.findOneBy({ id });
  }

  async remove(id: number): Promise<void> {
    await this.rolesRepository.delete(id);
  }
}
