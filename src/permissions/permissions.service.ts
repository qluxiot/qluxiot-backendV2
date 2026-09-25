import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permission } from './entities/permission.entity';

@Injectable()
export class PermissionsService implements OnModuleInit {
  constructor(
    @InjectRepository(Permission)
    private permissionsRepository: Repository<Permission>,
  ) { }

  async onModuleInit() {
    const permissions = [
      { code: 'USER_MANAGEMENT.LISTING', description: 'View user management' },
      { code: 'USER_MANAGEMENT.CREATE', description: 'Create users' },
      { code: 'USER_MANAGEMENT.UPDATE', description: 'Update users' },
      { code: 'USER_MANAGEMENT.DELETE', description: 'Delete users' },
      { code: 'ROLE_MANAGEMENT.LISTING', description: 'View role management' },
      { code: 'ROLE_MANAGEMENT.CREATE', description: 'Create roles' },
      { code: 'ROLE_MANAGEMENT.UPDATE', description: 'Update roles' },
      { code: 'ROLE_MANAGEMENT.DELETE', description: 'Delete roles' },
      { code: 'ROLE_PERMISSION.LISTING', description: 'View role permissions' },
      { code: 'ROLE_PERMISSION.UPDATE', description: 'Assign role permissions' },

      { code: 'SMART_LED_STREETLIGHT.LISTING', description: 'View smart LED streetlight list' },
      { code: 'SMART_LED_STREETLIGHT.CREATE', description: 'Create smart LED streetlight' },
      { code: 'SMART_LED_STREETLIGHT.UPDATE', description: 'Update smart LED streetlight' },
      { code: 'SMART_LED_STREETLIGHT.DELETE', description: 'Delete smart LED streetlight' },
      { code: 'SMART_SOLAR.LISTING', description: 'View smart solar list' },
      { code: 'SMART_SOLAR.CREATE', description: 'Create smart solar' },
      { code: 'SMART_SOLAR.UPDATE', description: 'Update smart solar' },
      { code: 'SMART_SOLAR.DELETE', description: 'Delete smart solar' },

      { code: 'UC100_SOLAR.LISTING', description: 'View UC100 solar list' },
      { code: 'UC100_SOLAR.CREATE', description: 'Create UC100 solar' },
      { code: 'UC100_SOLAR.UPDATE', description: 'Update UC100 solar' },
      { code: 'UC100_SOLAR.DELETE', description: 'Delete UC100 solar' },
      { code: 'SMART_CITY_POLE.LISTING', description: 'View smart city pole list' },
      { code: 'SMART_CITY_POLE.CREATE', description: 'Create smart city pole' },
      { code: 'SMART_CITY_POLE.UPDATE', description: 'Update smart city pole' },
      { code: 'SMART_CITY_POLE.DELETE', description: 'Delete smart city pole' },

      { code: 'NOTIFICATION_SETUP.LISTING', description: 'View notification channels' },
      { code: 'NOTIFICATION_SETUP.CREATE', description: 'Register a new notification channel' },
      { code: 'NOTIFICATION_SETUP.DELETE', description: 'Delete a notification channel' },
      { code: 'NOTIFICATION_SETUP.WHATSAPP_MANAGE', description: 'Manage WhatsApp server (connect, reset, logout)' },
    ];

    for (const permission of permissions) {
      const existing = await this.permissionsRepository.findOneBy({
        code: permission.code,
      });

      if (!existing) {
        await this.permissionsRepository.save(
          this.permissionsRepository.create(permission),
        );
      }
    }
  }

  findAll(): Promise<Permission[]> {
    return this.permissionsRepository.find({
      order: {
        code: 'ASC',
      },
    });
  }

  async create(permission: Partial<Permission>): Promise<Permission> {
    const p = this.permissionsRepository.create(permission);
    return this.permissionsRepository.save(p);
  }

  async createMany(perms: Partial<Permission>[]): Promise<Permission[]> {
    const entities = perms.map(p => this.permissionsRepository.create(p));
    return this.permissionsRepository.save(entities);
  }
}
