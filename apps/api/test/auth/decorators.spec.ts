import { describe, it, expect } from 'vitest';
import { IS_PUBLIC_KEY } from '../../src/auth/decorators/public.decorator';
import { ROLES_KEY } from '../../src/auth/decorators/roles.decorator';

describe('Auth Decorators', () => {
  describe('Public decorator', () => {
    it('should export IS_PUBLIC_KEY constant', () => {
      expect(IS_PUBLIC_KEY).toBe('isPublic');
    });
  });

  describe('Roles decorator', () => {
    it('should export ROLES_KEY constant', () => {
      expect(ROLES_KEY).toBe('roles');
    });
  });
});
