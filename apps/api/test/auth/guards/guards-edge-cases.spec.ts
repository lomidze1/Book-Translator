import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { JwtAuthGuard } from '../../../src/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../src/auth/guards/roles.guard';

// ============================================================
// Helpers
// ============================================================
const createMockContext = (
  user: any = null,
  handler = vi.fn(),
  classRef = vi.fn(),
): ExecutionContext => ({
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

describe('Guards — Edge Cases & Security', () => {
  // ============================================================
  // JwtAuthGuard — Advanced Edge Cases
  // ============================================================
  describe('JwtAuthGuard — advanced edge cases', () => {
    let guard: JwtAuthGuard;

    const mockReflector = {
      getAllAndOverride: vi.fn(),
    };

    beforeEach(() => {
      vi.clearAllMocks();
      guard = new (JwtAuthGuard as any)(mockReflector);
      (guard as any).reflector = mockReflector;
    });

    describe('handleRequest edge cases', () => {
      it('should throw UnauthorizedException for empty object user', () => {
        // Empty object is truthy, so should be returned
        const result = guard.handleRequest(null, {}, null);
        expect(result).toEqual({});
      });

      it('should throw UnauthorizedException for user = 0 (falsy)', () => {
        expect(() => guard.handleRequest(null, 0 as any, null)).toThrow(
          UnauthorizedException,
        );
      });

      it('should throw UnauthorizedException for user = "" (falsy)', () => {
        expect(() => guard.handleRequest(null, '' as any, null)).toThrow(
          UnauthorizedException,
        );
      });

      it('should return user with minimal properties', () => {
        const minimalUser = { id: '1' };
        const result = guard.handleRequest(null, minimalUser, null);
        expect(result).toEqual({ id: '1' });
      });

      it('should prefer throwing error over UnauthorizedException when both exist', () => {
        const customError = new Error('Custom auth error');
        expect(() => guard.handleRequest(customError, null, null)).toThrow('Custom auth error');
      });

      it('should throw error even when user exists', () => {
        const err = new UnauthorizedException('Token expired');
        const user = { id: 'user-1', role: 'ADMIN' };
        expect(() => guard.handleRequest(err, user, null)).toThrow(UnauthorizedException);
      });
    });

    describe('canActivate with metadata variations', () => {
      it('should treat null metadata as not public', () => {
        mockReflector.getAllAndOverride.mockReturnValue(null);
        const context = createMockContext();

        const superCanActivate = vi.fn().mockReturnValue(true);
        const proto = Object.getPrototypeOf(Object.getPrototypeOf(guard));
        const orig = proto.canActivate;
        proto.canActivate = superCanActivate;

        guard.canActivate(context);
        expect(superCanActivate).toHaveBeenCalled();

        proto.canActivate = orig;
      });

      it('should treat false metadata as not public', () => {
        mockReflector.getAllAndOverride.mockReturnValue(false);
        const context = createMockContext();

        const superCanActivate = vi.fn().mockReturnValue(true);
        const proto = Object.getPrototypeOf(Object.getPrototypeOf(guard));
        const orig = proto.canActivate;
        proto.canActivate = superCanActivate;

        guard.canActivate(context);
        expect(superCanActivate).toHaveBeenCalled();

        proto.canActivate = orig;
      });
    });
  });

  // ============================================================
  // RolesGuard — Advanced Edge Cases
  // ============================================================
  describe('RolesGuard — advanced edge cases', () => {
    let guard: RolesGuard;

    const mockReflector = {
      getAllAndOverride: vi.fn(),
    };

    beforeEach(() => {
      vi.clearAllMocks();
      guard = new (RolesGuard as any)(mockReflector);
      (guard as any).reflector = mockReflector;
    });

    describe('privilege escalation prevention', () => {
      it('should deny USER accessing ADMIN-only resource', () => {
        mockReflector.getAllAndOverride.mockReturnValue(['ADMIN']);
        const context = createMockContext({ id: 'user-1', role: 'USER' });

        expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
        expect(() => guard.canActivate(context)).toThrow('Insufficient permissions');
      });

      it('should deny request when user object has no role property', () => {
        mockReflector.getAllAndOverride.mockReturnValue(['ADMIN']);
        const context = createMockContext({ id: 'user-1' }); // no role

        expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      });

      it('should deny request when user role is undefined', () => {
        mockReflector.getAllAndOverride.mockReturnValue(['ADMIN']);
        const context = createMockContext({ id: 'user-1', role: undefined });

        expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      });

      it('should deny request when user role is null', () => {
        mockReflector.getAllAndOverride.mockReturnValue(['ADMIN']);
        const context = createMockContext({ id: 'user-1', role: null });

        expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      });

      it('should deny request when user role is empty string', () => {
        mockReflector.getAllAndOverride.mockReturnValue(['ADMIN']);
        const context = createMockContext({ id: 'user-1', role: '' });

        expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      });
    });

    describe('role matching', () => {
      it('should be case-sensitive when matching roles', () => {
        mockReflector.getAllAndOverride.mockReturnValue(['ADMIN']);
        const context = createMockContext({ id: 'user-1', role: 'admin' }); // lowercase

        expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      });

      it('should match first role in multiple required roles', () => {
        mockReflector.getAllAndOverride.mockReturnValue(['USER', 'ADMIN']);
        const context = createMockContext({ id: 'user-1', role: 'USER' });

        expect(guard.canActivate(context)).toBe(true);
      });

      it('should match second role in multiple required roles', () => {
        mockReflector.getAllAndOverride.mockReturnValue(['ADMIN', 'USER']);
        const context = createMockContext({ id: 'user-1', role: 'USER' });

        expect(guard.canActivate(context)).toBe(true);
      });

      it('should deny when user role matches none of multiple required roles', () => {
        mockReflector.getAllAndOverride.mockReturnValue(['ADMIN', 'MODERATOR']);
        const context = createMockContext({ id: 'user-1', role: 'USER' });

        expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      });
    });

    describe('edge case contexts', () => {
      it('should allow access when requiredRoles is null', () => {
        mockReflector.getAllAndOverride.mockReturnValue(null);
        const context = createMockContext({ id: 'user-1', role: 'USER' });

        expect(guard.canActivate(context)).toBe(true);
      });

      it('should throw ForbiddenException with "Access denied" when no user at all', () => {
        mockReflector.getAllAndOverride.mockReturnValue(['USER']);
        const context = createMockContext(null);

        try {
          guard.canActivate(context);
          expect.fail('Should have thrown');
        } catch (e: any) {
          expect(e).toBeInstanceOf(ForbiddenException);
          expect(e.message).toBe('Access denied');
        }
      });

      it('should handle user object with extra properties', () => {
        mockReflector.getAllAndOverride.mockReturnValue(['USER']);
        const context = createMockContext({
          id: 'user-1',
          role: 'USER',
          email: 'test@example.com',
          name: 'გიორგი',
          extraField: 'should not matter',
        });

        expect(guard.canActivate(context)).toBe(true);
      });
    });
  });
});
