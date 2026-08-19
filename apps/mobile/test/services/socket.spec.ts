import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  io: vi.fn(),
}));

vi.mock('socket.io-client', () => ({ io: h.io }));

function makeFakeSocket() {
  return { connected: false, disconnect: vi.fn() };
}

// The module keeps the socket in module scope — re-import per test.
async function loadModule() {
  vi.resetModules();
  return import('@/services/socket');
}

beforeEach(() => {
  h.io.mockReset();
  h.io.mockImplementation(() => makeFakeSocket());
});

describe('connectSocket', () => {
  it('connects to the notifications namespace with the auth token over websocket', async () => {
    const { connectSocket, getSocket } = await loadModule();

    const socket = connectSocket('tok-1');

    expect(h.io).toHaveBeenCalledTimes(1);
    const [url, options] = h.io.mock.calls[0];
    expect(url).toContain('/notifications');
    expect(options).toEqual({
      auth: { token: 'tok-1' },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });
    expect(getSocket()).toBe(socket);
  });

  it('reuses the existing socket while it is connected', async () => {
    const { connectSocket } = await loadModule();

    const first = connectSocket('tok-1');
    (first as { connected: boolean }).connected = true;
    const second = connectSocket('tok-2');

    expect(second).toBe(first);
    expect(h.io).toHaveBeenCalledTimes(1);
  });

  it('creates a new socket when the previous one is disconnected', async () => {
    const { connectSocket } = await loadModule();

    const first = connectSocket('tok-1');
    const second = connectSocket('tok-1');

    expect(second).not.toBe(first);
    expect(h.io).toHaveBeenCalledTimes(2);
  });
});

describe('disconnectSocket', () => {
  it('disconnects and clears the singleton', async () => {
    const { connectSocket, disconnectSocket, getSocket } = await loadModule();

    const socket = connectSocket('tok-1');
    disconnectSocket();

    expect(socket.disconnect).toHaveBeenCalledTimes(1);
    expect(getSocket()).toBeNull();
  });

  it('is safe to call when no socket exists', async () => {
    const { disconnectSocket, getSocket } = await loadModule();

    expect(() => disconnectSocket()).not.toThrow();
    expect(getSocket()).toBeNull();
  });
});

describe('getSocket', () => {
  it('returns null before any connection', async () => {
    const { getSocket } = await loadModule();

    expect(getSocket()).toBeNull();
  });
});
