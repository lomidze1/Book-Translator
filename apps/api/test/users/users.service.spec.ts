import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { UsersService } from '../../src/users/users.service';

describe('UsersService', () => {
  let usersService: UsersService;

  const mockPrismaService = {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    phone: '+995599123456',
    name: 'გიორგი',
    avatar: null,
    role: 'USER',
    locale: 'ka',
    emailVerified: new Date('2024-01-01'),
    phoneVerified: true,
    createdAt: new Date('2024-01-01'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    usersService = new (UsersService as any)(mockPrismaService);
  });

  // ============================================================
  // GET PROFILE
  // ============================================================
  describe('getProfile', () => {
    it('should return user profile with selected fields', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      const result = await usersService.getProfile('user-123');

      expect(result).toEqual(mockUser);
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        select: {
          id: true,
          email: true,
          phone: true,
          name: true,
          avatar: true,
          role: true,
          locale: true,
          emailVerified: true,
          phoneVerified: true,
          createdAt: true,
        },
      });
    });

    it('should throw NotFoundException if user does not exist', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(usersService.getProfile('nonexistent-id')).rejects.toThrow(NotFoundException);
      await expect(usersService.getProfile('nonexistent-id')).rejects.toThrow('User not found');
    });

    it('should not expose sensitive fields like passwordHash', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      await usersService.getProfile('user-123');

      // The select query should not include passwordHash
      const callArgs = mockPrismaService.user.findUnique.mock.calls[0][0];
      expect(callArgs.select).not.toHaveProperty('passwordHash');
    });
  });

  // ============================================================
  // UPDATE PROFILE
  // ============================================================
  describe('updateProfile', () => {
    it('should update user name successfully', async () => {
      const updateDto = { name: 'ნიკა' };
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.user.update.mockResolvedValue({ ...mockUser, name: 'ნიკა' });

      const result = await usersService.updateProfile('user-123', updateDto);

      expect(result.name).toBe('ნიკა');
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: {
          name: 'ნიკა',
          locale: undefined,
          avatar: undefined,
        },
        select: expect.any(Object),
      });
    });

    it('should update locale to English', async () => {
      const updateDto = { locale: 'en' };
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.user.update.mockResolvedValue({ ...mockUser, locale: 'en' });

      const result = await usersService.updateProfile('user-123', updateDto);

      expect(result.locale).toBe('en');
    });

    it('should update avatar URL', async () => {
      const updateDto = { avatar: 'https://s3.example.com/avatars/user-123.jpg' };
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.user.update.mockResolvedValue({
        ...mockUser,
        avatar: updateDto.avatar,
      });

      const result = await usersService.updateProfile('user-123', updateDto);

      expect(result.avatar).toBe(updateDto.avatar);
    });

    it('should update multiple fields at once', async () => {
      const updateDto = { name: 'ნიკა', locale: 'en', avatar: 'https://example.com/pic.jpg' };
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.user.update.mockResolvedValue({
        ...mockUser,
        ...updateDto,
      });

      const result = await usersService.updateProfile('user-123', updateDto);

      expect(result.name).toBe('ნიკა');
      expect(result.locale).toBe('en');
      expect(result.avatar).toBe('https://example.com/pic.jpg');
    });

    it('should throw NotFoundException if user does not exist', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(
        usersService.updateProfile('nonexistent-id', { name: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ============================================================
  // DELETE ACCOUNT
  // ============================================================
  describe('deleteAccount', () => {
    it('should delete user account successfully', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.user.delete.mockResolvedValue(mockUser);

      const result = await usersService.deleteAccount('user-123');

      expect(result).toEqual({ message: 'Account deleted successfully' });
      expect(mockPrismaService.user.delete).toHaveBeenCalledWith({
        where: { id: 'user-123' },
      });
    });

    it('should throw NotFoundException if user does not exist', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(usersService.deleteAccount('nonexistent-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
