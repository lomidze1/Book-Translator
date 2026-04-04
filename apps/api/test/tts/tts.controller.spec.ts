import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { TtsController } from '../../src/tts/tts.controller';

describe('TtsController', () => {
  let controller: TtsController;

  const mockService = {
    getAudioUrl: vi.fn(),
    listAudioChapters: vi.fn(),
    synthesize: vi.fn(),
    synthesizeBook: vi.fn(),
    getVoices: vi.fn(),
    getAudioBookStatus: vi.fn(),
    getStreamUrl: vi.fn(),
    deleteAudioBook: vi.fn(),
    estimate: vi.fn(),
    retryFailed: vi.fn(),
    getTimestamps: vi.fn(),
  };

  const mockProviderManager = {
    getAvailableProviders: vi.fn(),
    getAllVoices: vi.fn(),
  };

  const user = { id: 'user-1' };

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new (TtsController as any)(mockService, mockProviderManager);
  });

  describe('GET /tts/audio/:bookId/:chapterNumber', () => {
    it('should return audio URL from service', async () => {
      mockService.getAudioUrl.mockResolvedValue('https://s3.example.com/audio.mp3');
      const result = await controller.getAudio(user, 'book-1', 1);
      expect(result).toBe('https://s3.example.com/audio.mp3');
    });

    it('should return null when no audio exists', async () => {
      mockService.getAudioUrl.mockResolvedValue(null);
      const result = await controller.getAudio(user, 'book-1', 1);
      expect(result).toBeNull();
    });

    it('should call service with correct params including userId', async () => {
      mockService.getAudioUrl.mockResolvedValue(null);
      await controller.getAudio(user, 'book-1', 3);
      expect(mockService.getAudioUrl).toHaveBeenCalledWith('book-1', 3, 'user-1');
    });
  });

  describe('GET /tts/chapters/:bookId', () => {
    it('should return chapter list from service', async () => {
      mockService.listAudioChapters.mockResolvedValue([{ chapterNumber: 1, status: 'COMPLETED' }]);
      const result = await controller.listChapters(user, 'book-1');
      expect(result).toHaveLength(1);
      expect(mockService.listAudioChapters).toHaveBeenCalledWith('book-1', 'user-1');
    });
  });

  describe('POST /tts/synthesize', () => {
    it('should call service with userId and dto', async () => {
      mockService.synthesize.mockResolvedValue({ status: 'queued' });
      const dto = { bookId: 'book-1', chapterNumber: 1 };
      await controller.synthesize(user, dto);
      expect(mockService.synthesize).toHaveBeenCalledWith('user-1', dto);
    });

    it('should propagate NotFoundException', async () => {
      mockService.synthesize.mockRejectedValue(new NotFoundException());
      await expect(controller.synthesize(user, { bookId: 'x', chapterNumber: 1 }))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('POST /tts/synthesize-book', () => {
    it('should call synthesizeBook with userId and dto', async () => {
      mockService.synthesizeBook.mockResolvedValue({ status: 'queued', totalChapters: 5 });
      const dto = { bookId: 'book-1' };
      await controller.synthesizeBook(user, dto);
      expect(mockService.synthesizeBook).toHaveBeenCalledWith('user-1', dto);
    });

    it('should propagate ForbiddenException', async () => {
      mockService.synthesizeBook.mockRejectedValue(new ForbiddenException());
      await expect(controller.synthesizeBook(user, { bookId: 'x' }))
        .rejects.toThrow(ForbiddenException);
    });
  });

  describe('GET /tts/voices', () => {
    it('should return available voices', async () => {
      mockService.getVoices.mockResolvedValue([{ id: 'v1', name: 'Ka', provider: 'elevenlabs' }]);
      const result = await controller.getVoices();
      expect(result).toHaveLength(1);
    });
  });

  describe('GET /tts/status/:audioBookId', () => {
    it('should call getAudioBookStatus with audioBookId and userId', async () => {
      mockService.getAudioBookStatus.mockResolvedValue({ status: 'IN_PROGRESS' });
      await controller.getStatus(user, 'ab-1');
      expect(mockService.getAudioBookStatus).toHaveBeenCalledWith('ab-1', 'user-1');
    });

    it('should propagate NotFoundException', async () => {
      mockService.getAudioBookStatus.mockRejectedValue(new NotFoundException());
      await expect(controller.getStatus(user, 'invalid')).rejects.toThrow(NotFoundException);
    });
  });

  describe('GET /tts/stream/:audioChapterId', () => {
    it('should call getStreamUrl', async () => {
      mockService.getStreamUrl.mockResolvedValue('https://s3.example.com/stream.mp3');
      const result = await controller.getStream(user, 'ac-1');
      expect(result).toBe('https://s3.example.com/stream.mp3');
    });
  });

  describe('DELETE /tts/audio/:audioBookId', () => {
    it('should call deleteAudioBook', async () => {
      mockService.deleteAudioBook.mockResolvedValue(undefined);
      await controller.deleteAudio(user, 'ab-1');
      expect(mockService.deleteAudioBook).toHaveBeenCalledWith('ab-1', 'user-1');
    });

    it('should propagate ForbiddenException', async () => {
      mockService.deleteAudioBook.mockRejectedValue(new ForbiddenException());
      await expect(controller.deleteAudio(user, 'ab-1')).rejects.toThrow(ForbiddenException);
    });
  });

  // ========================
  // Phase 6 new endpoints
  // ========================

  describe('GET /tts/estimate', () => {
    it('should call estimate with bookId and userId', async () => {
      mockService.estimate.mockResolvedValue({ totalChapters: 5, estimatedCostUsd: 0.98 });
      const result = await controller.estimate(user, 'book-1', undefined);
      expect(result.totalChapters).toBe(5);
      expect(mockService.estimate).toHaveBeenCalledWith('book-1', 'user-1', undefined);
    });

    it('should pass provider to estimate', async () => {
      mockService.estimate.mockResolvedValue({ provider: 'elevenlabs' });
      await controller.estimate(user, 'book-1', 'elevenlabs');
      expect(mockService.estimate).toHaveBeenCalledWith('book-1', 'user-1', 'elevenlabs');
    });
  });

  describe('POST /tts/retry/:audioBookId', () => {
    it('should call retryFailed with audioBookId and userId', async () => {
      mockService.retryFailed.mockResolvedValue({ retriedChapters: [3, 7], status: 'queued' });
      const result = await controller.retry(user, 'ab-1');
      expect(result.retriedChapters).toEqual([3, 7]);
      expect(mockService.retryFailed).toHaveBeenCalledWith('ab-1', 'user-1');
    });

    it('should propagate NotFoundException', async () => {
      mockService.retryFailed.mockRejectedValue(new NotFoundException());
      await expect(controller.retry(user, 'nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('GET /tts/:audioBookId/timestamps/:chapterNumber', () => {
    it('should call getTimestamps with correct params', async () => {
      mockService.getTimestamps.mockResolvedValue({
        chapterNumber: 1,
        timestamps: [{ text: 'test', startMs: 0, endMs: 5000 }],
      });
      const result = await controller.getTimestamps(user, 'ab-1', 1);
      expect(result.chapterNumber).toBe(1);
      expect(mockService.getTimestamps).toHaveBeenCalledWith('ab-1', 1, 'user-1');
    });

    it('should propagate NotFoundException', async () => {
      mockService.getTimestamps.mockRejectedValue(new NotFoundException());
      await expect(controller.getTimestamps(user, 'ab-1', 99)).rejects.toThrow(NotFoundException);
    });
  });

  describe('GET /tts/providers', () => {
    it('should return available providers from ProviderManager', async () => {
      mockProviderManager.getAvailableProviders.mockReturnValue([
        { name: 'google-cloud', available: true, languages: ['ka', 'en'], costPerMillionChars: 4 },
      ]);
      const result = await controller.getProviders();
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('google-cloud');
    });
  });

  describe('GET /tts/voices/all', () => {
    it('should call getAllVoices with language filter', async () => {
      mockProviderManager.getAllVoices.mockResolvedValue([
        { id: 'ka-GE-Neural2-A', provider: 'google-cloud' },
      ]);
      const result = await controller.getAllVoices('ka');
      expect(result).toHaveLength(1);
      expect(mockProviderManager.getAllVoices).toHaveBeenCalledWith('ka');
    });

    it('should call getAllVoices without filter', async () => {
      mockProviderManager.getAllVoices.mockResolvedValue([]);
      await controller.getAllVoices(undefined);
      expect(mockProviderManager.getAllVoices).toHaveBeenCalledWith(undefined);
    });
  });
});
