import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreatePaymentDto } from '../../src/payment/dto/create-payment.dto';
import { BogCallbackDto, TbcCallbackDto } from '../../src/payment/dto/webhook-callback.dto';

describe('CreatePaymentDto', () => {
  function toDto(data: Record<string, unknown>) {
    return plainToInstance(CreatePaymentDto, data);
  }

  it('should pass with valid data', async () => {
    const dto = toDto({
      bookId: 'book-1',
      type: 'TRANSLATION',
      provider: 'BOG',
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should pass with all fields', async () => {
    const dto = toDto({
      bookId: 'book-1',
      type: 'PURCHASE_TRANSLATION',
      provider: 'TBC',
      translationId: 'trans-1',
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should fail without bookId', async () => {
    const dto = toDto({ type: 'TRANSLATION', provider: 'BOG' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should fail with empty bookId', async () => {
    const dto = toDto({ bookId: '', type: 'TRANSLATION', provider: 'BOG' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should fail with invalid type', async () => {
    const dto = toDto({ bookId: 'book-1', type: 'INVALID', provider: 'BOG' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should fail with invalid provider', async () => {
    const dto = toDto({ bookId: 'book-1', type: 'TRANSLATION', provider: 'STRIPE' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should accept PURCHASE_ORIGINAL type', async () => {
    const dto = toDto({ bookId: 'book-1', type: 'PURCHASE_ORIGINAL', provider: 'BOG' });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should accept TBC provider', async () => {
    const dto = toDto({ bookId: 'book-1', type: 'TRANSLATION', provider: 'TBC' });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should allow optional translationId', async () => {
    const dto = toDto({ bookId: 'book-1', type: 'TRANSLATION', provider: 'BOG' });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
    expect(dto.translationId).toBeUndefined();
  });
});

describe('BogCallbackDto', () => {
  function toDto(data: Record<string, unknown>) {
    return plainToInstance(BogCallbackDto, data);
  }

  it('should pass with valid BOG payload', async () => {
    const dto = toDto({ order_id: 'order-123', status: 'success' });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should fail without order_id', async () => {
    const dto = toDto({ status: 'success' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should fail without status', async () => {
    const dto = toDto({ order_id: 'order-123' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should fail with empty order_id', async () => {
    const dto = toDto({ order_id: '', status: 'success' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('TbcCallbackDto', () => {
  function toDto(data: Record<string, unknown>) {
    return plainToInstance(TbcCallbackDto, data);
  }

  it('should pass with valid TBC payload', async () => {
    const dto = toDto({ PaymentId: 'pay-123', Status: 'Succeeded' });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should fail without PaymentId', async () => {
    const dto = toDto({ Status: 'Succeeded' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should fail without Status', async () => {
    const dto = toDto({ PaymentId: 'pay-123' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
