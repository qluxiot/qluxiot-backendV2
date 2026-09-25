import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Mark a controller or route handler as publicly accessible (no JWT required).
 * Usage: @Public() above your route handler.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
