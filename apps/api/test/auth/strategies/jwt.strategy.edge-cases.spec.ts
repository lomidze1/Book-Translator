import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from '../../../src/auth/strategies/jwt.strategy';
import { JwtPayload } from '../../../src/auth/interfaces';

// Mock passport-jwt
vi.mock('passport-jwt', () => ({
  ExtractJwt: {
    fromAuthHeaderAsBearerToken: vi.fn().mockReturnValue(() => 'mock-token'),
  },
  Strategy: class MockStrategy {
    constructor(_options: any) {}
  },
}));

// Mock @nestjs/passport
vi.mock('@nestjs/passport', () => ({
  PassportStrategy: (_Strategy: any, _name: string) => {
    return class {
      constructor() {}
    };
  },
}));

describe('JwtStrategy — Edge Cases & Security', () => {
  let strategy: JwtStrategy;

  const mockPrisma = {
    user: {
      findUnique: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_ACCESS_SECRET = 'test-secret';
    strategy = new (JwtStrategy as any)(mockPrisma);
    (strategy as any).prisma = mockPrisma;
  });

  // ============================================================
  // validate — Edge Cases
  // ============================================================
  describe('validate — edge cases', () => {
    it('should reject payload with nonexistent user id', async () => {
      const payload: JwtPayload = { sub: 'deleted-user-id', email: 'gone@example.com' };
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
      await expect(strategy.validate(payload)).rejects.toThrow('User not found');
    });

    it('should handle payload with null email', async () => {
      const payload: JwtPayload = { sub: 'user-1', email: null };
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: null,
        name: 'ტელეფონის მომხმარებელი',
        role: 'USER',
        avatar: null,
      });

      const result = await strategy.validate(payload);

      expect(result.email).toBeNull();
      expect(result.id).toBe('user-1');
    });

    it('should handle payload with additional JWT fields (iat, exp)', async () => {
      const payload: JwtPayload = {
        sub: 'user-1',
        email: 'test@example.com',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 900, // 15 minutes
      };
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test',
        role: 'USER',
        avatar: null,
      });

      const result = await strategy.validate(payload);

      expect(result).toBeDefined();
      // Should use sub for lookup, not care about iat/exp
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        select: expect.any(Object),
      });
    });

    it('should only select safe fields (no passwordHash, no phone)', async () => {
      const payload: JwtPayload = { sub: 'user-1', email: 'test@example.com' };
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test',
        role: 'USER',
        avatar: null,
      });

      await strategy.validate(payload);

      const select = mockPrisma.user.findUnique.mock.calls[0][0].select;
      expect(select.id).toBe(true);
      expect(select.email).toBe(true);
      expect(select.name).toBe(true);
      expect(select.role).toBe(true);
      expect(select.avatar).toBe(true);
      // Should NOT select sensitive fields
      expect(select.passwordHash).toBeUndefined();
      expect(select.phone).toBeUndefined();
      expect(select.locale).toBeUndefined();
    });

    it('should handle database connection error', async () => {
      const payload: JwtPayload = { sub: 'user-1', email: 'test@example.com' };
      mockPrisma.user.findUnique.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(strategy.validate(payload)).rejects.toThrow('ECONNREFUSED');
    });

    it('should return ADMIN user with correct role', async () => {
      const payload: JwtPayload = { sub: 'admin-1', email: 'admin@example.com' };
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'admin-1',
        email: 'admin@example.com',
        name: 'ადმინი',
        role: 'ADMIN',
        avatar: 'https://example.com/admin.jpg',
      });

      const result = await strategy.validate(payload);

      expect(result.role).toBe('ADMIN');
      expect(result.id).toBe('admin-1');
    });

    it('should handle user with avatar', async () => {
      const payload: JwtPayload = { sub: 'user-1', email: 'test@example.com' };
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        name: 'გიორგი',
        role: 'USER',
        avatar: 'https://lh3.googleusercontent.com/photo.jpg',
      });

      const result = await strategy.validate(payload);

      expect(result.avatar).toBe('https://lh3.googleusercontent.com/photo.jpg');
    });

    it('should handle empty string sub in payload', async () => {
      const payload: JwtPayload = { sub: '', email: 'test@example.com' };
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: '' },
        select: expect.any(Object),
      });
    });

    it('should handle user with Georgian name', async () => {
      const payload: JwtPayload = { sub: 'user-1', email: 'gio@example.com' };
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'gio@example.com',
        name: 'გიორგი ბერიძე',
        role: 'USER',
        avatar: null,
      });

      const result = await strategy.validate(payload);

      expect(result.name).toBe('გიორგი ბერიძე');
    });
  });
});
