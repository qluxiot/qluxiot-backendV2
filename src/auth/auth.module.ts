import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { RolesModule } from '../roles/roles.module';
import { RolePermissionsModule } from '../role-permissions/role-permissions.module';

@Module({
  imports: [
    // Read JWT secret from environment variable — never hardcode secrets!
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '1d' },
      }),
    }),
    UsersModule,
    RolesModule,
    RolePermissionsModule,
  ],
  controllers: [AuthController],
  providers: [AuthService],
  // Export JwtModule so JwtAuthGuard (used globally via AppModule) can inject JwtService
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
