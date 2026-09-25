import { Controller, Get, Post, Body, Param, Delete, Put } from '@nestjs/common';
import { RolePermissionsService } from './role-permissions.service';
import { RolePermission } from './entities/role-permission.entity';

@Controller('role-permissions')
export class RolePermissionsController {
  constructor(private readonly rolePermissionsService: RolePermissionsService) {}

  @Get()
  findAll() {
    return this.rolePermissionsService.findAll();
  }

  @Get('role/:roleId')
  findByRole(@Param('roleId') roleId: string) {
    return this.rolePermissionsService.findByRoleId(+roleId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.rolePermissionsService.findOne(+id);
  }

  @Post()
  create(@Body() rolePermission: Partial<RolePermission>) {
    return this.rolePermissionsService.create(rolePermission);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() updateRolePermission: Partial<RolePermission>) {
    return this.rolePermissionsService.update(+id, updateRolePermission);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.rolePermissionsService.remove(+id);
  }

  @Post('bulk')
  setForRole(@Body() body: { roleId: number; permissionIds: number[] }) {
    return this.rolePermissionsService.setPermissionsForRole(
      +body.roleId,
      body.permissionIds,
    );
  }
}
