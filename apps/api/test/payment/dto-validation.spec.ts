import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreatePaymentDto } from '../../src/payment/dto/create-payment.dto';
import { FlittCallbackDto } from '../../src/payment/dto/webhook-callback.dto';

describe('CreatePaymentDto', () => {
  function toDto(data: Record<string, unknown>) {
    return plainToInstance(CreatePaymentDto, data);
  }

  it('should pass with valid data', async () => {
    const dto = toDto({
      bookId: 'book-1',
      type: 'TRANSLATION',
      provider: 'FLITT',
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should pass with all fields', async () => {
    const dto = toDto({
      bookId: 'book-1',
      type: 'PURCHASE_TRANSLATION',
      provider: 'FLITT',
      translationId: 'trans-1',
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should fail without bookId', async () => {
    const dto = toDto({ type: 'TRANSLATION', provider: 'FLITT' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should fail with empty bookId', async () => {
    const dto = toDto({ bookId: '', type: 'TRANSLATION', provider: 'FLITT' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should fail with invalid type', async () => {
    const dto = toDto({ bookId: 'book-1', type: 'INVALID', provider: 'FLITT' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should fail with invalid provider', async () => {
    const dto = toDto({ bookId: 'book-1', type: 'TRANSLATION', provider: 'BOG' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should accept PURCHASE_ORIGINAL type', async () => {
    const dto = toDto({ bookId: 'book-1', type: 'PURCHASE_ORIGINAL', provider: 'FLITT' });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should allow optional translationId', async () => {
    const dto = toDto({ bookId: 'book-1', type: 'TRANSLATION', provider: 'FLITT' });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
    expect(dto.translationId).toBeUndefined();
  });
});

describe('FlittCallbackDto', () => {
  function toDto(data: Record<string, unknown>) {
    return plainToInstance(FlittCallbackDto, data);
  }

  it('should pass with valid Flitt payload', async () => {
    const dto = toDto({ order_id: 'order-123', order_status: 'approved', signature: 'abc123' });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should fail without order_id', async () => {
    const dto = toDto({ order_status: 'approved', signature: 'abc' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should fail without order_status', async () => {
    const dto = toDto({ order_id: 'order-123', signature: 'abc' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should fail without signature', async () => {
    const dto = toDto({ order_id: 'order-123', order_status: 'approved' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should fail with empty order_id', async () => {
    const dto = toDto({ order_id: '', order_status: 'approved', signature: 'abc' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
