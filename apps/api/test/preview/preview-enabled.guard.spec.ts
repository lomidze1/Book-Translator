import { describe, it, expect, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { PreviewEnabledGuard } from '../../src/preview/guards/preview-enabled.guard';

function guardWith(value: unknown) {
  return new PreviewEnabledGuard({ get: vi.fn().mockReturnValue(value) } as any);
}

describe('PreviewEnabledGuard', () => {
  it('allows generation when the flag is exactly "true"', () => {
    expect(guardWith('true').canActivate()).toBe(true);
  });

  // Fail-secure: anything that isn't the literal string "true" keeps it off, so
  // a typo or a stray value can't accidentally start spending Claude tokens.
  it.each([undefined, '', 'false', 'TRUE', '1', 'yes', true])(
    'blocks generation when the flag is %p',
    (value) => {
      expect(() => guardWith(value).canActivate()).toThrow(ForbiddenException);
    },
  );
});
