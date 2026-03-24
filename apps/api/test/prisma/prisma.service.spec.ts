import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('PrismaService', () => {
  let service: PrismaService;

  beforeEach(() => {
    service = new PrismaService();
    // Mock PrismaClient methods
    service.$connect = vi.fn().mockResolvedValue(undefined);
    service.$disconnect = vi.fn().mockResolvedValue(undefined);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should connect on module init', async () => {
    await service.onModuleInit();
    expect(service.$connect).toHaveBeenCalled();
  });

  it('should disconnect on module destroy', async () => {
    await service.onModuleDestroy();
    expect(service.$disconnect).toHaveBeenCalled();
  });

  it('should handle connection errors gracefully', async () => {
    service.$connect = vi.fn().mockRejectedValue(new Error('Connection failed'));
    await expect(service.onModuleInit()).rejects.toThrow('Connection failed');
  });

  it('should handle disconnect errors gracefully', async () => {
    service.$disconnect = vi.fn().mockRejectedValue(new Error('Disconnect failed'));
    await expect(service.onModuleDestroy()).rejects.toThrow('Disconnect failed');
  });
});
