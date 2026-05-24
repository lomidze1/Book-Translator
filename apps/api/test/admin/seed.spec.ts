import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The seed script imports PrismaClient and executes immediately on load. We
// mock the client and re-import per test to exercise its branches without
// hitting a real DB.
const mockUpdate = vi.fn();
const mockFindUnique = vi.fn();
const mockDisconnect = vi.fn();

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(() => ({
    user: {
      findUnique: mockFindUnique,
      update: mockUpdate,
    },
    $disconnect: mockDisconnect,
  })),
}));

async function runSeed(): Promise<void> {
  vi.resetModules();
  await import('../../prisma/seed');
  // The seed kicks off main() at import time; give the microtask queue a
  // tick so its .finally() (disconnect) settles before we assert.
  await new Promise(resolve => setImmediate(resolve));
}

describe('prisma/seed.ts', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.INITIAL_ADMIN_EMAIL;
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('skips when INITIAL_ADMIN_EMAIL is unset', async () => {
    await runSeed();
    expect(mockFindUnique).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('INITIAL_ADMIN_EMAIL not set'));
  });

  it('warns when the target email has no matching user', async () => {
    process.env.INITIAL_ADMIN_EMAIL = 'ghost@example.com';
    mockFindUnique.mockResolvedValue(null);

    await runSeed();

    expect(mockFindUnique).toHaveBeenCalledWith({ where: { email: 'ghost@example.com' } });
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('no such user exists'));
  });

  it('skips update when user is already ADMIN', async () => {
    process.env.INITIAL_ADMIN_EMAIL = 'admin@example.com';
    mockFindUnique.mockResolvedValue({ id: 'u1', role: 'ADMIN' });

    await runSeed();

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('already ADMIN'));
  });

  it('promotes a regular USER to ADMIN', async () => {
    process.env.INITIAL_ADMIN_EMAIL = 'lomidze@example.com';
    mockFindUnique.mockResolvedValue({ id: 'u1', role: 'USER' });
    mockUpdate.mockResolvedValue({ id: 'u1', role: 'ADMIN' });

    await runSeed();

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { role: 'ADMIN' },
    });
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Promoted'));
  });

  it('lowercases and trims INITIAL_ADMIN_EMAIL before lookup', async () => {
    process.env.INITIAL_ADMIN_EMAIL = '  Lomidze@Example.COM  ';
    mockFindUnique.mockResolvedValue(null);

    await runSeed();

    expect(mockFindUnique).toHaveBeenCalledWith({ where: { email: 'lomidze@example.com' } });
  });
});
