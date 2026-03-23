import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { RolesGuard } from '../../../src/auth/guards/roles.guard';

describe('RolesGuard', () => {
  let guard: RolesGuard;

  const mockReflector = {
    getAllAndOverride: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    guard = new (RolesGuard as any)(mockReflector);
    (guard as any).reflector = mockReflector;
  });

  const createMockContext = (user: any = null, handler = vi.fn(), classRef = vi.fn()): ExecutionContext => ({
    getHandler: () => handler,
    getClass: () => classRef,
    switchToHttp: () => ({
      getRequest: () => ({ user }),
      getResponse: () => ({}),
      getNext: () => vi.fn(),
    }),
    getArgs: () => [],
    getArgByIndex: () => ({}),
    switchToRpc: () => ({} as any),
    switchToWs: () => ({} as any),
    getType: () => 'http' as const,
  });

  // ============================================================
  // canActivate
  // ============================================================
  describe('canActivate', () => {
    it('should allow access when no roles are required', () => {
      mockReflector.getAllAndOverride.mockReturnValue(undefined);
      const context = createMockContext({ id: 'user-1', role: 'USER' });

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow access when roles array is empty', () => {
      mockReflector.getAllAndOverride.mockReturnValue([]);
      const context = createMockContext({ id: 'user-1', role: 'USER' });

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow access when user has the required role', () => {
      mockReflector.getAllAndOverride.mockReturnValue(['ADMIN']);
      const context = createMockContext({ id: 'admin-1', role: 'ADMIN' });

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow access when user has one of the required roles', () => {
      mockReflector.getAllAndOverride.mockReturnValue(['ADMIN', 'MODERATOR']);
      const context = createMockContext({ id: 'admin-1', role: 'ADMIN' });

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should throw ForbiddenException when user does not have the required role', () => {
      mockReflector.getAllAndOverride.mockReturnValue(['ADMIN']);
      const context = createMockContext({ id: 'user-1', role: 'USER' });

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow('Insufficient permissions');
    });

    it('should throw ForbiddenException when user is null', () => {
      mockReflector.getAllAndOverride.mockReturnValue(['ADMIN']);
      const context = createMockContext(null);

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow('Access denied');
    });

    it('should throw ForbiddenException when user is undefined', () => {
      mockReflector.getAllAndOverride.mockReturnValue(['ADMIN']);
      const context = createMockContext(undefined);

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('should check ROLES_KEY metadata on handler and class', () => {
      const handler = vi.fn();
      const classRef = vi.fn();
      mockReflector.getAllAndOverride.mockReturnValue(null);
      const context = createMockContext({ role: 'USER' }, handler, classRef);

      guard.canActivate(context);

      expect(mockReflector.getAllAndOverride).toHaveBeenCalledWith('roles', [
        handler,
        classRef,
      ]);
    });

    it('should handle USER role correctly', () => {
      mockReflector.getAllAndOverride.mockReturnValue(['USER']);
      const context = createMockContext({ id: 'user-1', role: 'USER' });

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should deny USER when only ADMIN is required', () => {
      mockReflector.getAllAndOverride.mockReturnValue(['ADMIN']);
      const context = createMockContext({ id: 'user-1', role: 'USER' });

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });
  });
});
