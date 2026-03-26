import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmailService } from '../../src/email/email.service';

// Mock Resend
const mockSend = vi.fn().mockResolvedValue({ id: 'email-123' });
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: mockSend },
  })),
}));

describe('EmailService', () => {
  let emailService: EmailService;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESEND_API_KEY = 're_test_key';
    process.env.FRONTEND_URL = 'http://localhost:3000';
    process.env.EMAIL_FROM = 'noreply@book-translator.ge';
    emailService = new EmailService();
  });

  it('should be defined', () => {
    expect(emailService).toBeDefined();
  });

  // ============================================================
  // sendPasswordResetEmail
  // ============================================================
  describe('sendPasswordResetEmail', () => {
    it('should call Resend with correct from/to/subject', async () => {
      await emailService.sendPasswordResetEmail('user@example.com', 'abc123token');

      expect(mockSend).toHaveBeenCalledTimes(1);
      const callArgs = mockSend.mock.calls[0][0];
      expect(callArgs.from).toBe('noreply@book-translator.ge');
      expect(callArgs.to).toBe('user@example.com');
      expect(callArgs.subject).toBe('პაროლის აღდგენა — Book Translator');
    });

    it('should include reset URL with token in email body', async () => {
      await emailService.sendPasswordResetEmail('user@example.com', 'my-reset-token');

      const callArgs = mockSend.mock.calls[0][0];
      expect(callArgs.html).toContain('http://localhost:3000/reset-password?token=my-reset-token');
    });

    it('should use FRONTEND_URL from env for reset link', async () => {
      process.env.FRONTEND_URL = 'https://book-translator.ge';
      emailService = new EmailService();

      await emailService.sendPasswordResetEmail('user@example.com', 'token123');

      const callArgs = mockSend.mock.calls[0][0];
      expect(callArgs.html).toContain('https://book-translator.ge/reset-password?token=token123');
    });

    it('should handle Resend API error', async () => {
      mockSend.mockRejectedValueOnce(new Error('Resend API error'));

      await expect(
        emailService.sendPasswordResetEmail('user@example.com', 'token'),
      ).rejects.toThrow('Resend API error');
    });

    it('should include user name in template if provided', async () => {
      await emailService.sendPasswordResetEmail('user@example.com', 'token', 'გიორგი');

      const callArgs = mockSend.mock.calls[0][0];
      expect(callArgs.html).toContain('გამარჯობა, გიორგი!');
    });

    it('should use generic greeting if name not provided', async () => {
      await emailService.sendPasswordResetEmail('user@example.com', 'token');

      const callArgs = mockSend.mock.calls[0][0];
      expect(callArgs.html).toContain('გამარჯობა!');
      expect(callArgs.html).not.toContain('გამარჯობა, !');
    });
  });

  // ============================================================
  // sendEmailVerification
  // ============================================================
  describe('sendEmailVerification', () => {
    it('should call Resend with correct from/to/subject', async () => {
      await emailService.sendEmailVerification('user@example.com', 'verify-token');

      expect(mockSend).toHaveBeenCalledTimes(1);
      const callArgs = mockSend.mock.calls[0][0];
      expect(callArgs.from).toBe('noreply@book-translator.ge');
      expect(callArgs.to).toBe('user@example.com');
      expect(callArgs.subject).toBe('ემაილის დადასტურება — Book Translator');
    });

    it('should include verification URL with token', async () => {
      await emailService.sendEmailVerification('user@example.com', 'my-verify-token');

      const callArgs = mockSend.mock.calls[0][0];
      expect(callArgs.html).toContain('http://localhost:3000/verify-email?token=my-verify-token');
    });

    it('should handle Resend API error', async () => {
      mockSend.mockRejectedValueOnce(new Error('API down'));

      await expect(
        emailService.sendEmailVerification('user@example.com', 'token'),
      ).rejects.toThrow('API down');
    });
  });
});
