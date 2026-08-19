import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiRequest } from '@/services/api';
import { createPayment, getBookPricing } from '@/services/payment';

vi.mock('@/services/api', () => ({
  apiRequest: vi.fn(),
}));

const apiRequestMock = vi.mocked(apiRequest);

beforeEach(() => {
  apiRequestMock.mockReset();
});

describe('createPayment', () => {
  it('posts the full payment body to /payments', async () => {
    apiRequestMock.mockResolvedValue({ paymentUrl: 'https://pay', paymentId: 'p1' });

    await createPayment({
      bookId: 'b1',
      type: 'TRANSLATION',
      provider: 'FLITT',
      translationId: 't1',
    });

    expect(apiRequestMock).toHaveBeenCalledTimes(1);
    const [path, options] = apiRequestMock.mock.calls[0];
    expect(path).toBe('/payments');
    expect(options?.method).toBe('POST');
    expect(JSON.parse(options?.body as string)).toEqual({
      bookId: 'b1',
      type: 'TRANSLATION',
      provider: 'FLITT',
      translationId: 't1',
    });
  });

  it('omits translationId from the body when not provided', async () => {
    apiRequestMock.mockResolvedValue({ paymentUrl: 'https://pay', paymentId: 'p1' });

    await createPayment({ bookId: 'b1', type: 'TRANSLATION', provider: 'FLITT' });

    const [, options] = apiRequestMock.mock.calls[0];
    expect(JSON.parse(options?.body as string)).toEqual({
      bookId: 'b1',
      type: 'TRANSLATION',
      provider: 'FLITT',
    });
  });

  it('returns the payment url and id from the API', async () => {
    apiRequestMock.mockResolvedValue({ paymentUrl: 'https://pay/checkout', paymentId: 'p2' });

    const result = await createPayment({ bookId: 'b1', type: 'TRANSLATION', provider: 'FLITT' });

    expect(result).toEqual({ paymentUrl: 'https://pay/checkout', paymentId: 'p2' });
  });

  it('propagates API errors unchanged', async () => {
    const err = Object.assign(new Error('Too many requests'), { status: 429, code: 'RATE_LIMIT' });
    apiRequestMock.mockRejectedValue(err);

    await expect(
      createPayment({ bookId: 'b1', type: 'TRANSLATION', provider: 'FLITT' }),
    ).rejects.toBe(err);
  });
});

describe('getBookPricing', () => {
  it('fetches pricing for the book with a plain GET', async () => {
    apiRequestMock.mockResolvedValue({ newTranslation: 10, existing: 5, english: 3 });

    const pricing = await getBookPricing('b42');

    expect(apiRequestMock).toHaveBeenCalledWith('/payments/pricing/b42');
    expect(pricing).toEqual({ newTranslation: 10, existing: 5, english: 3 });
  });

  it('propagates API errors unchanged', async () => {
    const err = new Error('Not found');
    apiRequestMock.mockRejectedValue(err);

    await expect(getBookPricing('missing')).rejects.toBe(err);
  });
});
