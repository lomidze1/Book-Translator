import { describe, it, expect } from 'vitest';
import { ExecutionContext } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { CurrentUser } from '../../src/auth/decorators/current-user.decorator';

// Helper to extract the decorator factory function from NestJS metadata
function getParamDecoratorFactory(decorator: Function) {
  class TestController {
    test(@decorator() _value: unknown) {}
  }

  const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, TestController, 'test');
  return args[Object.keys(args)[0]].factory;
}

function createMockExecutionContext(user: any): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe('CurrentUser Decorator', () => {
  const factory = getParamDecoratorFactory(CurrentUser);

  it('should return the full user object when no data property specified', () => {
    const user = { id: 'user-1', email: 'test@example.com', name: 'გიორგი' };
    const ctx = createMockExecutionContext(user);

    const result = factory(undefined, ctx);

    expect(result).toEqual(user);
  });

  it('should return a specific user property when data is provided', () => {
    const user = { id: 'user-1', email: 'test@example.com', name: 'გიორგი' };
    const ctx = createMockExecutionContext(user);

    const result = factory('email', ctx);

    expect(result).toBe('test@example.com');
  });

  it('should return id property when data is "id"', () => {
    const user = { id: 'user-123', email: 'test@example.com' };
    const ctx = createMockExecutionContext(user);

    const result = factory('id', ctx);

    expect(result).toBe('user-123');
  });

  it('should return undefined for non-existent property', () => {
    const user = { id: 'user-1', email: 'test@example.com' };
    const ctx = createMockExecutionContext(user);

    const result = factory('nonExistent', ctx);

    expect(result).toBeUndefined();
  });

  it('should return undefined when user is null and data is specified', () => {
    const ctx = createMockExecutionContext(null);

    const result = factory('email', ctx);

    expect(result).toBeUndefined();
  });

  it('should return null when user is null and no data specified', () => {
    const ctx = createMockExecutionContext(null);

    const result = factory(undefined, ctx);

    expect(result).toBeNull();
  });

  it('should return undefined when user is undefined and no data specified', () => {
    const ctx = createMockExecutionContext(undefined);

    const result = factory(undefined, ctx);

    expect(result).toBeUndefined();
  });

  it('should handle user with Georgian unicode properties', () => {
    const user = {
      id: 'user-1',
      name: 'ნინო ბურჯანაძე',
      email: 'nino@example.com',
    };
    const ctx = createMockExecutionContext(user);

    const result = factory('name', ctx);

    expect(result).toBe('ნინო ბურჯანაძე');
  });

  it('should return empty string data property correctly', () => {
    const user = { id: 'user-1', email: 'test@example.com' };
    const ctx = createMockExecutionContext(user);

    // Empty string is falsy so it goes to the else branch
    const result = factory('', ctx);

    expect(result).toEqual(user);
  });
});
