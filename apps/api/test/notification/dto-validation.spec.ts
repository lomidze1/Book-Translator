import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdatePreferencesDto } from '../../src/notification/dto/update-preferences.dto';
import { SubscribePushDto } from '../../src/notification/dto/subscribe-push.dto';

describe('UpdatePreferencesDto', () => {
  it('should accept valid boolean fields', async () => {
    const dto = plainToInstance(UpdatePreferencesDto, {
      emailEnabled: false,
      pushEnabled: true,
      translationCompleted: false,
    });

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should accept empty object (all optional)', async () => {
    const dto = plainToInstance(UpdatePreferencesDto, {});
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should reject non-boolean emailEnabled', async () => {
    const dto = plainToInstance(UpdatePreferencesDto, {
      emailEnabled: 'yes',
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('SubscribePushDto', () => {
  it('should accept valid subscription data', async () => {
    const dto = plainToInstance(SubscribePushDto, {
      endpoint: 'https://push.example.com/sub/abc123',
      p256dh: 'BPvz3...',
      auth: 'DGv6RA...',
    });

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should reject empty endpoint', async () => {
    const dto = plainToInstance(SubscribePushDto, {
      endpoint: '',
      p256dh: 'key',
      auth: 'auth',
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject missing p256dh', async () => {
    const dto = plainToInstance(SubscribePushDto, {
      endpoint: 'https://push.example.com',
      auth: 'auth',
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject missing auth', async () => {
    const dto = plainToInstance(SubscribePushDto, {
      endpoint: 'https://push.example.com',
      p256dh: 'key',
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should accept optional userAgent', async () => {
    const dto = plainToInstance(SubscribePushDto, {
      endpoint: 'https://push.example.com',
      p256dh: 'key',
      auth: 'auth',
      userAgent: 'Mozilla/5.0',
    });

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });
});
