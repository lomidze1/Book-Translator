import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { UsersService } from '../../src/users/users.service';

describe('UsersService — Edge Cases & Security', () => {
  let usersService: UsersService;

  const mockPrisma = {
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
    usersService = new (UsersService as any)(mockPrisma);
  });

  // ============================================================
  // GET PROFILE — Edge Cases
  // ============================================================
  describe('getProfile — edge cases', () => {
    it('should not include passwordHash in select query', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      await usersService.getProfile('user-123');

      const selectArg = mockPrisma.user.findUnique.mock.calls[0][0].select;
      expect(selectArg).not.toHaveProperty('passwordHash');
      expect(selectArg).not.toHaveProperty('updatedAt');
    });

    it('should return profile for user with null email', async () => {
      const phoneUser = { ...mockUser, email: null, emailVerified: null };
      mockPrisma.user.findUnique.mockResolvedValue(phoneUser);

      const result = await usersService.getProfile('user-123');

      expect(result.email).toBeNull();
      expect(result.phone).toBe('+995599123456');
    });

    it('should return profile for user with null phone', async () => {
      const emailUser = { ...mockUser, phone: null, phoneVerified: false };
      mockPrisma.user.findUnique.mockResolvedValue(emailUser);

      const result = await usersService.getProfile('user-123');

      expect(result.phone).toBeNull();
      expect(result.email).toBe('test@example.com');
    });

    it('should return profile for ADMIN user', async () => {
      const adminUser = { ...mockUser, role: 'ADMIN' };
      mockPrisma.user.findUnique.mockResolvedValue(adminUser);

      const result = await usersService.getProfile('admin-1');

      expect(result.role).toBe('ADMIN');
    });

    it('should propagate database errors', async () => {
      mockPrisma.user.findUnique.mockRejectedValue(new Error('Connection lost'));

      await expect(usersService.getProfile('user-123')).rejects.toThrow('Connection lost');
    });

    it('should throw NotFoundException with correct message', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(usersService.getProfile('no-such-user')).rejects.toThrow('User not found');
    });

    it('should handle empty string userId', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(usersService.getProfile('')).rejects.toThrow(NotFoundException);
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: '' },
        select: expect.any(Object),
      });
    });

    it('should include all expected profile fields', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await usersService.getProfile('user-123');

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('email');
      expect(result).toHaveProperty('phone');
      expect(result).toHaveProperty('name');
      expect(result).toHaveProperty('avatar');
      expect(result).toHaveProperty('role');
      expect(result).toHaveProperty('locale');
      expect(result).toHaveProperty('emailVerified');
      expect(result).toHaveProperty('phoneVerified');
      expect(result).toHaveProperty('createdAt');
    });
  });

  // ============================================================
  // UPDATE PROFILE — Edge Cases
  // ============================================================
  describe('updateProfile — edge cases', () => {
    it('should handle updating with empty DTO (no changes)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.user.update.mockResolvedValue(mockUser);

      const result = await usersService.updateProfile('user-123', {});

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: {
          name: undefined,
          locale: undefined,
          avatar: undefined,
        },
        select: expect.any(Object),
      });
    });

    it('should update with Georgian name containing special characters', async () => {
      const dto = { name: 'ნინო ჩხეიძე-ბარათაშვილი' };
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.user.update.mockResolvedValue({ ...mockUser, name: dto.name });

      const result = await usersService.updateProfile('user-123', dto);

      expect(result.name).toBe('ნინო ჩხეიძე-ბარათაშვილი');
    });

    it('should throw NotFoundException before attempting update', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        usersService.updateProfile('nonexistent', { name: 'Test' }),
      ).rejects.toThrow(NotFoundException);

      // update should NOT have been called
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('should propagate database error during update', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.user.update.mockRejectedValue(new Error('Unique constraint violation'));

      await expect(
        usersService.updateProfile('user-123', { name: 'ტესტი' }),
      ).rejects.toThrow('Unique constraint violation');
    });

    it('should not update email or password through updateProfile', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.user.update.mockResolvedValue(mockUser);

      await usersService.updateProfile('user-123', {
        name: 'New Name',
      } as any);

      const updateCall = mockPrisma.user.update.mock.calls[0][0];
      expect(updateCall.data).not.toHaveProperty('email');
      expect(updateCall.data).not.toHaveProperty('passwordHash');
      expect(updateCall.data).not.toHaveProperty('role');
    });

    it('should not expose passwordHash in update response', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.user.update.mockResolvedValue(mockUser);

      await usersService.updateProfile('user-123', { name: 'Test' });

      const selectArg = mockPrisma.user.update.mock.calls[0][0].select;
      expect(selectArg).not.toHaveProperty('passwordHash');
    });

    it('should handle locale change from ka to en', async () => {
      const dto = { locale: 'en' };
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.user.update.mockResolvedValue({ ...mockUser, locale: 'en' });

      const result = await usersService.updateProfile('user-123', dto);

      expect(result.locale).toBe('en');
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ locale: 'en' }),
        }),
      );
    });

    it('should handle setting avatar to null (clearing avatar)', async () => {
      const dto = { avatar: undefined };
      mockPrisma.user.findUnique.mockResolvedValue({ ...mockUser, avatar: 'old-url' });
      mockPrisma.user.update.mockResolvedValue({ ...mockUser, avatar: undefined });

      await usersService.updateProfile('user-123', dto);

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ avatar: undefined }),
        }),
      );
    });
  });

  // ============================================================
  // DELETE ACCOUNT — Edge Cases
  // ============================================================
  describe('deleteAccount — edge cases', () => {
    it('should verify user exists before deletion', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.user.delete.mockResolvedValue(mockUser);

      await usersService.deleteAccount('user-123');

      expect(mockPrisma.user.findUnique).toHaveBeenCalledBefore(mockPrisma.user.delete);
    });

    it('should not call delete if user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(usersService.deleteAccount('nonexistent')).rejects.toThrow(NotFoundException);
      expect(mockPrisma.user.delete).not.toHaveBeenCalled();
    });

    it('should propagate cascade deletion errors', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.user.delete.mockRejectedValue(
        new Error('Foreign key constraint failed'),
      );

      await expect(usersService.deleteAccount('user-123')).rejects.toThrow(
        'Foreign key constraint failed',
      );
    });

    it('should return correct message after successful deletion', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.user.delete.mockResolvedValue(mockUser);

      const result = await usersService.deleteAccount('user-123');

      expect(result).toEqual({ message: 'Account deleted successfully' });
    });

    it('should delete ADMIN accounts the same way as USER accounts', async () => {
      const adminUser = { ...mockUser, role: 'ADMIN' };
      mockPrisma.user.findUnique.mockResolvedValue(adminUser);
      mockPrisma.user.delete.mockResolvedValue(adminUser);

      const result = await usersService.deleteAccount('admin-1');

      expect(result).toEqual({ message: 'Account deleted successfully' });
    });

    it('should handle concurrent deletion attempts', async () => {
      mockPrisma.user.findUnique
        .mockResolvedValueOnce(mockUser)
        .mockResolvedValueOnce(null);
      mockPrisma.user.delete.mockResolvedValueOnce(mockUser);

      const result1 = await usersService.deleteAccount('user-123');
      expect(result1.message).toBe('Account deleted successfully');

      await expect(usersService.deleteAccount('user-123')).rejects.toThrow(NotFoundException);
    });
  });
});
