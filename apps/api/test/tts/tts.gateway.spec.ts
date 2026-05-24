import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TtsGateway } from '../../src/tts/tts.gateway';

describe('TtsGateway', () => {
  let gateway: TtsGateway;

  // The auth handshake now lives in SocketAuthService — the gateway just
  // delegates. We test that delegation here and trust the dedicated
  // socket-auth.service.spec for the verify/tokenVersion logic itself.
  const mockSocketAuth = {
    authenticate: vi.fn(),
  };

  const mockPrisma = {
    audioBook: {
      findUnique: vi.fn(),
    },
  };

  const createMockClient = (token?: string) => ({
    id: 'client-1',
    handshake: {
      auth: { token },
      query: {},
    },
    join: vi.fn(),
    leave: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
    data: {} as any,
    userId: undefined as string | undefined,
  });

  const mockRoom = {
    emit: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    gateway = new (TtsGateway as any)(mockSocketAuth, mockPrisma);
    (gateway as any).server = {
      to: vi.fn().mockReturnValue(mockRoom),
    };
  });

  describe('handleConnection', () => {
    it('should delegate authentication to SocketAuthService', async () => {
      mockSocketAuth.authenticate.mockResolvedValue('user-1');
      const client = createMockClient('valid-token');

      await gateway.handleConnection(client as any);

      expect(mockSocketAuth.authenticate).toHaveBeenCalledWith(client, 'TTS');
    });

    it('should not block when authenticate rejects (service already disconnected)', async () => {
      // Returning null is the documented "rejected and disconnected" signal.
      mockSocketAuth.authenticate.mockResolvedValue(null);
      const client = createMockClient(undefined);

      // Should still resolve without throwing.
      await expect(gateway.handleConnection(client as any)).resolves.toBeUndefined();
    });
  });

  describe('handleSubscribe', () => {
    it('should join room when user owns the audioBook', async () => {
      mockPrisma.audioBook.findUnique.mockResolvedValue({
        id: 'ab-1',
        book: { userBooks: [{ userId: 'user-1' }] },
      });
      const client = createMockClient('token');
      (client as any).userId = 'user-1';

      await gateway.handleSubscribe(client as any, 'ab-1');

      expect(client.join).toHaveBeenCalledWith('audio:ab-1');
    });

    it('should NOT join room when user does not own the audioBook', async () => {
      mockPrisma.audioBook.findUnique.mockResolvedValue({
        id: 'ab-1',
        book: { userBooks: [] },
      });
      const client = createMockClient('token');
      (client as any).userId = 'user-1';

      await gateway.handleSubscribe(client as any, 'ab-1');

      expect(client.join).not.toHaveBeenCalled();
      expect(client.emit).toHaveBeenCalledWith('tts:error', expect.objectContaining({ error: expect.any(String) }));
    });

    it('should disconnect client with no userId', async () => {
      const client = createMockClient('token');
      // No userId set

      await gateway.handleSubscribe(client as any, 'ab-1');

      expect(client.disconnect).toHaveBeenCalled();
    });

    it('should NOT join room when audioBook not found', async () => {
      mockPrisma.audioBook.findUnique.mockResolvedValue(null);
      const client = createMockClient('token');
      (client as any).userId = 'user-1';

      await gateway.handleSubscribe(client as any, 'ab-1');

      expect(client.join).not.toHaveBeenCalled();
    });
  });

  describe('handleUnsubscribe', () => {
    it('should leave room', () => {
      const client = createMockClient('token');

      gateway.handleUnsubscribe(client as any, 'ab-1');

      expect(client.leave).toHaveBeenCalledWith('audio:ab-1');
    });
  });

  describe('emitProgress', () => {
    it('should emit to correct room', () => {
      const data = { chapterNumber: 1, chunkProgress: 50, overallProgress: 25 };

      gateway.emitProgress('ab-1', data);

      expect((gateway as any).server.to).toHaveBeenCalledWith('audio:ab-1');
      expect(mockRoom.emit).toHaveBeenCalledWith('tts:progress', data);
    });
  });

  describe('emitChapterDone', () => {
    it('should emit to correct room', () => {
      const data = { chapterNumber: 1, audioUrl: 'https://example.com', duration: 5000 };

      gateway.emitChapterDone('ab-1', data);

      expect(mockRoom.emit).toHaveBeenCalledWith('tts:chapter-done', data);
    });
  });

  describe('emitCompleted', () => {
    it('should emit to correct room', () => {
      const data = { totalDuration: 30000, totalSize: 50000 };

      gateway.emitCompleted('ab-1', data);

      expect(mockRoom.emit).toHaveBeenCalledWith('tts:completed', data);
    });
  });

  describe('emitError', () => {
    it('should emit to correct room', () => {
      const data = { chapterNumber: 2, error: 'synthesis failed' };

      gateway.emitError('ab-1', data);

      expect(mockRoom.emit).toHaveBeenCalledWith('tts:error', data);
    });
  });

  describe('emit methods when server is null', () => {
    it('should not throw when server is null', () => {
      (gateway as any).server = null;

      expect(() => gateway.emitProgress('ab-1', { chapterNumber: 1, chunkProgress: 50, overallProgress: 25 })).not.toThrow();
      expect(() => gateway.emitChapterDone('ab-1', { chapterNumber: 1, audioUrl: '', duration: 0 })).not.toThrow();
      expect(() => gateway.emitCompleted('ab-1', { totalDuration: 0, totalSize: 0 })).not.toThrow();
      expect(() => gateway.emitError('ab-1', { error: 'test' })).not.toThrow();
    });
  });
});
