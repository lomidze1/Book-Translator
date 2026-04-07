import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from '../../../src/auth/strategies/jwt.strategy';
import { JwtPayload } from '../../../src/auth/interfaces';

// Mock passport-jwt to avoid actual passport initialization
vi.mock('passport-jwt', () => ({
  ExtractJwt: {
    fromAuthHeaderAsBearerToken: vi.fn().mockReturnValue(() => 'mock-token'),
  },
  Strategy: class MockStrategy {
    constructor(_options: any) {
      // Mock constructor
    }
  },
}));

// Mock @nestjs/passport to return a base class
vi.mock('@nestjs/passport', () => ({
  PassportStrategy: (_Strategy: any, _name: string) => {
    return class {
      constructor() {
        // Mock base class
      }
    };
  },
}));

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;

  const mockPrismaService = {
    user: {
      findUnique: vi.fn(),
    },
  };

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    name: 'გიორგი',
    role: 'USER',
    avatar: null,
    tokenVersion: 0,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_ACCESS_SECRET = 'test-access-secret';
    strategy = new (JwtStrategy as any)(mockPrismaService);
    // Manually assign prisma since we're bypassing DI
    (strategy as any).prisma = mockPrismaService;
  });

  describe('validate', () => {
    it('should return user when valid payload is provided', async () => {
      const payload: JwtPayload = { sub: 'user-123', email: 'test@example.com' };
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      const result = await strategy.validate(payload);

      expect(result).toEqual(mockUser);
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          avatar: true,
          tokenVersion: true,
        },
      });
    });

    it('should throw UnauthorizedException when user is not found', async () => {
      const payload: JwtPayload = { sub: 'nonexistent-user', email: 'ghost@example.com' };
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
      await expect(strategy.validate(payload)).rejects.toThrow('User not found');
    });

    it('should query user by sub (userId) from payload', async () => {
      const payload: JwtPayload = { sub: 'user-456', email: null };
      mockPrismaService.user.findUnique.mockResolvedValue({
        ...mockUser,
        id: 'user-456',
        email: null,
      });

      await strategy.validate(payload);

      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-456' },
        select: expect.any(Object),
      });
    });

    it('should not expose sensitive fields like passwordHash', async () => {
      const payload: JwtPayload = { sub: 'user-123', email: 'test@example.com' };
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      await strategy.validate(payload);

      const selectArg = mockPrismaService.user.findUnique.mock.calls[0][0].select;
      expect(selectArg).not.toHaveProperty('passwordHash');
      expect(selectArg).not.toHaveProperty('phone');
      expect(selectArg.id).toBe(true);
      expect(selectArg.email).toBe(true);
      expect(selectArg.name).toBe(true);
      expect(selectArg.role).toBe(true);
      expect(selectArg.avatar).toBe(true);
    });

    it('should throw UnauthorizedException when tokenVersion is revoked', async () => {
      const payload: JwtPayload = { sub: 'user-123', email: 'test@example.com', tokenVersion: 0 };
      mockPrismaService.user.findUnique.mockResolvedValue({ ...mockUser, tokenVersion: 1 });

      await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
      await expect(strategy.validate(payload)).rejects.toThrow('Token has been revoked');
    });

    it('should accept token when tokenVersion matches', async () => {
      const payload: JwtPayload = { sub: 'user-123', email: 'test@example.com', tokenVersion: 2 };
      mockPrismaService.user.findUnique.mockResolvedValue({ ...mockUser, tokenVersion: 2 });

      const result = await strategy.validate(payload);
      expect(result).toBeDefined();
    });

    it('should work with user that has ADMIN role', async () => {
      const payload: JwtPayload = { sub: 'admin-1', email: 'admin@example.com' };
      const adminUser = { ...mockUser, id: 'admin-1', role: 'ADMIN' };
      mockPrismaService.user.findUnique.mockResolvedValue(adminUser);

      const result = await strategy.validate(payload);

      expect(result.role).toBe('ADMIN');
    });
  });
});
