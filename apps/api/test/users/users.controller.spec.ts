import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UsersController } from '../../src/users/users.controller';
import { UsersService } from '../../src/users/users.service';
import { NotFoundException } from '@nestjs/common';

describe('UsersController', () => {
  let controller: UsersController;
  let usersService: Partial<UsersService>;

  const mockUser = {
    id: 'user-1',
    email: 'test@example.com',
    phone: null,
    name: 'Test User',
    avatar: null,
    role: 'USER',
    locale: 'ka',
    emailVerified: null,
    phoneVerified: false,
    createdAt: new Date(),
  };

  beforeEach(() => {
    usersService = {
      getProfile: vi.fn().mockResolvedValue(mockUser),
      updateProfile: vi.fn().mockResolvedValue({ ...mockUser, name: 'Updated Name' }),
      deleteAccount: vi.fn().mockResolvedValue({ message: 'Account deleted successfully' }),
    };

    controller = new UsersController(usersService as UsersService);
  });

  describe('getProfile', () => {
    it('should return user profile', async () => {
      const result = await controller.getProfile('user-1');
      expect(result).toEqual(mockUser);
      expect(usersService.getProfile).toHaveBeenCalledWith('user-1');
    });

    it('should throw NotFoundException for invalid user', async () => {
      vi.mocked(usersService.getProfile!).mockRejectedValue(new NotFoundException('User not found'));
      await expect(controller.getProfile('invalid-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateProfile', () => {
    it('should update and return updated profile', async () => {
      const dto = { name: 'Updated Name' };
      const result = await controller.updateProfile('user-1', dto);
      expect(result.name).toBe('Updated Name');
      expect(usersService.updateProfile).toHaveBeenCalledWith('user-1', dto);
    });

    it('should throw NotFoundException for invalid user', async () => {
      vi.mocked(usersService.updateProfile!).mockRejectedValue(new NotFoundException('User not found'));
      await expect(controller.updateProfile('invalid-id', { name: 'Test' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteAccount', () => {
    it('should delete account and return success message', async () => {
      const result = await controller.deleteAccount('user-1', { password: 'test123' });
      expect(result).toEqual({ message: 'Account deleted successfully' });
      expect(usersService.deleteAccount).toHaveBeenCalledWith('user-1', 'test123');
    });

    it('should throw NotFoundException for invalid user', async () => {
      vi.mocked(usersService.deleteAccount!).mockRejectedValue(new NotFoundException('User not found'));
      await expect(controller.deleteAccount('invalid-id', {})).rejects.toThrow(NotFoundException);
    });
  });
});
