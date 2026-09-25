import { Injectable, NotFoundException, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Permission } from '../permissions/entities/permission.entity';
import { Role } from '../roles/entities/role.entity';
import { RolePermission } from './entities/role-permission.entity';

@Injectable()
export class RolePermissionsService implements OnApplicationBootstrap {
  constructor(
    @InjectRepository(RolePermission)
    private rolePermissionsRepository: Repository<RolePermission>,
    @InjectRepository(Role)
    private rolesRepository: Repository<Role>,
    @InjectRepository(Permission)
    private permissionsRepository: Repository<Permission>,
  ) {}

  async onApplicationBootstrap() {
    // Seed permissions for both 'Admin' and 'Super Admin' roles
    const adminRoles = await this.rolesRepository.find({
      where: [{ name: 'Admin' }, { name: 'Super Admin' }]
    });

    for (const role of adminRoles) {
      const allPermissions = await this.permissionsRepository.find();
      const existingPerms = await this.rolePermissionsRepository.find({ where: { roleId: role.id } });
      const existingPermIds = new Set(existingPerms.map(rp => rp.permissionId));
      
      const missingPermissions = allPermissions.filter(p => !existingPermIds.has(p.id));
      if (missingPermissions.length > 0) {
        const entities = missingPermissions.map((p) =>
          this.rolePermissionsRepository.create({
            roleId: role.id,
            permissionId: p.id,
          }),
        );
        await this.rolePermissionsRepository.save(entities);
        console.log(`Seeded ${missingPermissions.length} missing permissions to ${role.name} role`);
      }
    }
  }

  findAll(): Promise<RolePermission[]> {
    return this.rolePermissionsRepository.find({
      relations: {
        role: true,
        permission: true,
      },
      order: {
        roleId: 'ASC',
        permissionId: 'ASC',
      },
    });
  }

  findByRoleId(roleId: number): Promise<RolePermission[]> {
    return this.rolePermissionsRepository.find({
      where: { roleId },
      relations: {
        role: true,
        permission: true,
      },
      order: {
        permissionId: 'ASC',
      },
    });
  }

  findOne(id: number): Promise<RolePermission | null> {
    return this.rolePermissionsRepository.findOne({
      where: { id },
      relations: {
        role: true,
        permission: true,
      },
    });
  }

  async create(rolePermission: Partial<RolePermission>): Promise<RolePermission> {
    const newRolePermission = this.rolePermissionsRepository.create(rolePermission);
    return this.rolePermissionsRepository.save(newRolePermission);
  }

  async update(id: number, updateRolePermission: Partial<RolePermission>): Promise<RolePermission | null> {
    await this.rolePermissionsRepository.update(id, updateRolePermission);
    return this.rolePermissionsRepository.findOneBy({ id });
  }

  async remove(id: number): Promise<void> {
    await this.rolePermissionsRepository.delete(id);
  }

  async setPermissionsForRole(roleId: number, permissionIds: number[]): Promise<RolePermission[]> {
    const role = await this.rolesRepository.findOneBy({ id: roleId });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    const uniquePermissionIds = [...new Set(permissionIds ?? [])]
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0);

    await this.rolePermissionsRepository.manager.transaction(async (manager) => {
      await manager.delete(RolePermission, { roleId });

      if (!uniquePermissionIds.length) {
        return;
      }

      const permissions = await manager.find(Permission, {
        where: {
          id: In(uniquePermissionIds),
        },
      });

      const entities = permissions.map((permission) =>
        manager.create(RolePermission, {
          roleId,
          permissionId: permission.id,
        }),
      );

      await manager.save(RolePermission, entities);
    });

    return this.findByRoleId(roleId);
  }
}
