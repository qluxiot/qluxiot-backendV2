import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * Mark a route as requiring specific roles.
 * Usage: @Roles('Admin') above your route handler.
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
