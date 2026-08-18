import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RetranslationProcessor } from '../../src/translation/retranslation.processor';

describe('RetranslationProcessor', () => {
  let processor: RetranslationProcessor;

  const mockRetranslationService = { retranslate: vi.fn() };
  const mockQueue = {
    add: vi.fn().mockResolvedValue(undefined),
    getJob: vi.fn().mockResolvedValue(null),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockQueue.add.mockResolvedValue(undefined);
    mockQueue.getJob.mockResolvedValue(null);
    processor = new RetranslationProcessor(mockRetranslationService as any);
    // onModuleInit needs a live Redis connection — inject the queue directly.
    (processor as any).queue = mockQueue;
  });

  describe('enqueue', () => {
    it('adds a job with the deterministic jobId when none exists', async () => {
      await processor.enqueue('fb-1');

      expect(mockQueue.add).toHaveBeenCalledWith(
        'retranslate',
        { feedbackId: 'fb-1' },
        expect.objectContaining({ jobId: 'retranslate-fb-1' }),
      );
    });

    it('removes a stale completed job so the retry actually runs', async () => {
      // BullMQ silently ignores add() when a job with the same jobId is still
      // in the completed set (removeOnComplete: { count: 200 } retains it).
      const staleJob = {
        getState: vi.fn().mockResolvedValue('completed'),
        remove: vi.fn().mockResolvedValue(undefined),
      };
      mockQueue.getJob.mockResolvedValue(staleJob);

      await processor.enqueue('fb-1');

      expect(staleJob.remove).toHaveBeenCalled();
      expect(mockQueue.add).toHaveBeenCalledWith(
        'retranslate',
        { feedbackId: 'fb-1' },
        expect.objectContaining({ jobId: 'retranslate-fb-1' }),
      );
    });

    it('removes a stale failed job so the retry actually runs', async () => {
      const staleJob = {
        getState: vi.fn().mockResolvedValue('failed'),
        remove: vi.fn().mockResolvedValue(undefined),
      };
      mockQueue.getJob.mockResolvedValue(staleJob);

      await processor.enqueue('fb-1');

      expect(staleJob.remove).toHaveBeenCalled();
      expect(mockQueue.add).toHaveBeenCalled();
    });

    it('leaves a waiting job alone — the dedup is intentional there', async () => {
      const waitingJob = {
        getState: vi.fn().mockResolvedValue('waiting'),
        remove: vi.fn().mockResolvedValue(undefined),
      };
      mockQueue.getJob.mockResolvedValue(waitingJob);

      await processor.enqueue('fb-1');

      expect(waitingJob.remove).not.toHaveBeenCalled();
      expect(mockQueue.add).toHaveBeenCalled();
    });

    it('leaves an active job alone', async () => {
      const activeJob = {
        getState: vi.fn().mockResolvedValue('active'),
        remove: vi.fn().mockResolvedValue(undefined),
      };
      mockQueue.getJob.mockResolvedValue(activeJob);

      await processor.enqueue('fb-1');

      expect(activeJob.remove).not.toHaveBeenCalled();
    });

    it('skips silently when the queue is unavailable', async () => {
      (processor as any).queue = null;

      await expect(processor.enqueue('fb-1')).resolves.toBeUndefined();
      expect(mockQueue.add).not.toHaveBeenCalled();
    });
  });
});
