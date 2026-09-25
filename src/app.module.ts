import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './auth/roles.guard';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RolesModule } from './roles/roles.module';
import { RolePermissionsModule } from './role-permissions/role-permissions.module';
import { PermissionsModule } from './permissions/permissions.module';
import { SmartSolarModule } from './smart-solar/smart-solar.module';
import { NengjiaModule } from './nengjia/nengjia.module';
import { GuangmangModule } from './guangmang/guangmang.module';
import { SmartLedModule } from './smart-led/smart-led.module';
import { ProjectsModule } from './projects/projects.module';
import { AlarmsModule } from './alarms/alarms.module';
import { NotificationSetupModule } from './notification-setup/notification-setup.module';
import { BertamModule } from './bertam/bertam.module';
import { Uc100Module } from './uc100/uc100.module';

import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    // Rate Limiting: max 100 requests per 60 seconds per IP (protects from brute-force)
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: () => ({
        type: 'postgres',
        url: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        autoLoadEntities: true,
        synchronize: true,
      }),
    }),
    AuthModule,
    UsersModule,
    RolesModule,
    RolePermissionsModule,
    PermissionsModule,
    SmartSolarModule,
    NengjiaModule,
    GuangmangModule,
    SmartLedModule,
    ProjectsModule,
    AlarmsModule,
    NotificationSetupModule,
    BertamModule,
    Uc100Module,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // 1. Rate limiting: prevents brute-force and DoS attacks
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // 2. JWT Authentication: every route requires a valid token unless marked @Public()
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // 3. RBAC: routes marked @Roles('Admin') require the user to have that role
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule { }
