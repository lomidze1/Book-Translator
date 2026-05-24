import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SocketAuthService } from '../../src/auth/socket-auth.service';

describe('SocketAuthService', () => {
  let service: SocketAuthService;

  const mockJwtService = { verify: vi.fn() };
  const mockPrisma = { user: { findUnique: vi.fn() } };

  const createMockClient = (token?: string) => ({
    id: 'client-1',
    handshake: { auth: { token }, query: {} },
    disconnect: vi.fn(),
    userId: undefined as string | undefined,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SocketAuthService(mockJwtService as any, mockPrisma as any);
  });

  it('returns userId and attaches it to the client on success', async () => {
    mockJwtService.verify.mockReturnValue({ sub: 'user-1', tokenVersion: 0 });
    mockPrisma.user.findUnique.mockResolvedValue({ tokenVersion: 0 });
    const client = createMockClient('valid-token');

    const result = await service.authenticate(client as any, 'TestScope');

    expect(result).toBe('user-1');
    expect(client.userId).toBe('user-1');
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('rejects when no token is present', async () => {
    const client = createMockClient(undefined);

    const result = await service.authenticate(client as any, 'TestScope');

    expect(result).toBeNull();
    expect(client.disconnect).toHaveBeenCalled();
    expect(mockJwtService.verify).not.toHaveBeenCalled();
  });

  it('rejects when JWT verify throws (invalid signature / expired)', async () => {
    mockJwtService.verify.mockImplementation(() => {
      throw new Error('invalid signature');
    });
    const client = createMockClient('bad-token');

    const result = await service.authenticate(client as any, 'TestScope');

    expect(result).toBeNull();
    expect(client.disconnect).toHaveBeenCalled();
  });

  it('rejects when payload has no sub', async () => {
    mockJwtService.verify.mockReturnValue({ tokenVersion: 0 });
    const client = createMockClient('weird-token');

    const result = await service.authenticate(client as any, 'TestScope');

    expect(result).toBeNull();
    expect(client.disconnect).toHaveBeenCalled();
  });

  it('rejects when the user no longer exists in the DB', async () => {
    mockJwtService.verify.mockReturnValue({ sub: 'user-1', tokenVersion: 0 });
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const client = createMockClient('valid-token');

    const result = await service.authenticate(client as any, 'TestScope');

    expect(result).toBeNull();
    expect(client.disconnect).toHaveBeenCalled();
  });

  it('rejects when tokenVersion mismatch (revocation)', async () => {
    mockJwtService.verify.mockReturnValue({ sub: 'user-1', tokenVersion: 0 });
    mockPrisma.user.findUnique.mockResolvedValue({ tokenVersion: 1 });
    const client = createMockClient('stale-token');

    const result = await service.authenticate(client as any, 'TestScope');

    expect(result).toBeNull();
    expect(client.userId).toBeUndefined();
    expect(client.disconnect).toHaveBeenCalled();
  });

  it('accepts when payload omits tokenVersion (old tokens during migration)', async () => {
    // Defensive: tokens issued before the tokenVersion field was added should
    // still authenticate. JwtStrategy uses the same lenient check.
    mockJwtService.verify.mockReturnValue({ sub: 'user-1' });
    mockPrisma.user.findUnique.mockResolvedValue({ tokenVersion: 5 });
    const client = createMockClient('legacy-token');

    const result = await service.authenticate(client as any, 'TestScope');

    expect(result).toBe('user-1');
    expect(client.userId).toBe('user-1');
  });

  it('falls back to query.token when handshake.auth.token is missing', async () => {
    mockJwtService.verify.mockReturnValue({ sub: 'user-1', tokenVersion: 0 });
    mockPrisma.user.findUnique.mockResolvedValue({ tokenVersion: 0 });
    const client = {
      id: 'client-1',
      handshake: { auth: {}, query: { token: 'from-query' } },
      disconnect: vi.fn(),
      userId: undefined as string | undefined,
    };

    const result = await service.authenticate(client as any, 'TestScope');

    expect(result).toBe('user-1');
    expect(mockJwtService.verify).toHaveBeenCalledWith('from-query');
  });
});
