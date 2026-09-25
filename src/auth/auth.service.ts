import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { LoginDto } from './auth.dto';
import { UsersService } from '../users/users.service';
import { RolesService } from '../roles/roles.service';
import { RolePermissionsService } from '../role-permissions/role-permissions.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
    private readonly rolesService: RolesService,
    private readonly rolePermissionsService: RolePermissionsService,
  ) {}

  async login(loginDto: LoginDto) {
    const { username, password } = loginDto;

    // Database verification
    const user = await this.usersService.findByUsername(username);
    if (!user) {
      throw new UnauthorizedException({ success: false, message: 'Invalid username or password' });
    }

    // Secure bcrypt comparison
    // Also handles legacy plain-text passwords by auto-migrating them on first login
    let passwordValid = await bcrypt.compare(password, user.password);
    if (!passwordValid && user.password === password) {
      // Legacy plain-text match — migrate to hashed password silently
      await this.usersService.update(user.id, { password });
      passwordValid = true;
    }

    if (passwordValid) {
      let permissions: string[] = [];
      const roleEntity = await this.rolesService.findByName(user.userRole);
      if (roleEntity) {
        const rolePermissions = await this.rolePermissionsService.findByRoleId(roleEntity.id);
        permissions = rolePermissions
          .map((rp) => rp.permission?.code)
          .filter((code): code is string => !!code);
      }

      const payload = { 
        username: user.username, 
        sub: user.id, 
        role: user.userRole, 
        permissions,
        projectId: user.project?.id ?? null,
      };
      const token = this.jwtService.sign(payload);

      return {
        success: true,
        message: 'Login successful',
        data: {
          username: user.username,
          name: user.name,
          userId: user.id,
          role: user.userRole,
          token: token,
          permissions: permissions,
          projectId: user.project?.id ?? null,
          projectName: user.project?.name ?? null,
        }
      };
    }

    throw new UnauthorizedException({
      success: false,
      message: 'Invalid username or password'
    });
  }
}
