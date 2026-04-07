import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from '../../../src/auth/guards/jwt-auth.guard';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;

  const mockReflector = {
    getAllAndOverride: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    guard = new (JwtAuthGuard as any)(mockReflector);
    (guard as any).reflector = mockReflector;
  });

  const createMockExecutionContext = (handler = vi.fn(), classRef = vi.fn()): ExecutionContext => ({
    getHandler: () => handler,
    getClass: () => classRef,
    switchToHttp: () => ({
      getRequest: () => ({}),
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
  // canActivate - Public routes
  // ============================================================
  describe('canActivate', () => {
    it('should return true for routes marked as @Public()', () => {
      mockReflector.getAllAndOverride.mockReturnValue(true);
      const context = createMockExecutionContext();

      const result = guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should check IS_PUBLIC_KEY metadata on handler and class', () => {
      const handler = vi.fn();
      const classRef = vi.fn();
      mockReflector.getAllAndOverride.mockReturnValue(true);
      const context = createMockExecutionContext(handler, classRef);

      guard.canActivate(context);

      expect(mockReflector.getAllAndOverride).toHaveBeenCalledWith('isPublic', [
        handler,
        classRef,
      ]);
    });

    it('should delegate to passport when route is not public', () => {
      mockReflector.getAllAndOverride.mockReturnValue(false);
      const context = createMockExecutionContext();

      // Mock super.canActivate to avoid actual passport call
      const superCanActivate = vi.fn().mockReturnValue(true);
      const originalProto = Object.getPrototypeOf(Object.getPrototypeOf(guard));
      const origCanActivate = originalProto.canActivate;
      originalProto.canActivate = superCanActivate;

      const result = guard.canActivate(context);

      expect(superCanActivate).toHaveBeenCalledWith(context);
      expect(result).toBe(true);

      // Restore
      originalProto.canActivate = origCanActivate;
    });

    it('should not call passport when @Public() is set', () => {
      mockReflector.getAllAndOverride.mockReturnValue(true);
      const context = createMockExecutionContext();

      const superCanActivate = vi.fn();
      const originalProto = Object.getPrototypeOf(Object.getPrototypeOf(guard));
      const origCanActivate = originalProto.canActivate;
      originalProto.canActivate = superCanActivate;

      guard.canActivate(context);

      expect(superCanActivate).not.toHaveBeenCalled();

      originalProto.canActivate = origCanActivate;
    });

    it('should treat undefined metadata as not public', () => {
      mockReflector.getAllAndOverride.mockReturnValue(undefined);
      const context = createMockExecutionContext();

      const superCanActivate = vi.fn().mockReturnValue(true);
      const originalProto = Object.getPrototypeOf(Object.getPrototypeOf(guard));
      const origCanActivate = originalProto.canActivate;
      originalProto.canActivate = superCanActivate;

      guard.canActivate(context);

      expect(superCanActivate).toHaveBeenCalled();

      originalProto.canActivate = origCanActivate;
    });
  });

  // ============================================================
  // handleRequest
  // ============================================================
  describe('handleRequest', () => {
    let nonPublicContext: ExecutionContext;

    beforeEach(() => {
      nonPublicContext = createMockExecutionContext();
      mockReflector.getAllAndOverride.mockReturnValue(false);
    });

    it('should return user when authentication succeeds', () => {
      const mockUser = { id: 'user-123', email: 'test@example.com', role: 'USER' };

      const result = guard.handleRequest(null, mockUser, null, nonPublicContext);

      expect(result).toEqual(mockUser);
    });

    it('should throw UnauthorizedException when no user is returned', () => {
      expect(() => guard.handleRequest(null, null, null, nonPublicContext)).toThrow(UnauthorizedException);
      expect(() => guard.handleRequest(null, null, null, nonPublicContext)).toThrow('Authentication required');
    });

    it('should throw the original error when an error is passed', () => {
      const error = new Error('Token expired');

      expect(() => guard.handleRequest(error, null, null, nonPublicContext)).toThrow('Token expired');
    });

    it('should throw the error even when user is present', () => {
      const error = new UnauthorizedException('Custom error');
      const mockUser = { id: 'user-123' };

      expect(() => guard.handleRequest(error, mockUser, null, nonPublicContext)).toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when user is undefined', () => {
      expect(() => guard.handleRequest(null, undefined, null, nonPublicContext)).toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when user is false', () => {
      expect(() => guard.handleRequest(null, false, null, nonPublicContext)).toThrow(UnauthorizedException);
    });
  });
});
