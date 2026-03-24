import { describe, it, expect } from 'vitest';
import { AppModule } from '../src/app.module';
import { AuthModule } from '../src/auth/auth.module';
import { UsersModule } from '../src/users/users.module';
import { PrismaModule } from '../src/prisma/prisma.module';

describe('AppModule', () => {
  it('should be defined', () => {
    expect(AppModule).toBeDefined();
  });

  it('should have required modules', () => {
    // Verify module classes exist
    expect(AuthModule).toBeDefined();
    expect(UsersModule).toBeDefined();
    expect(PrismaModule).toBeDefined();
  });
});

describe('AuthModule', () => {
  it('should be defined', () => {
    expect(AuthModule).toBeDefined();
  });
});

describe('UsersModule', () => {
  it('should be defined', () => {
    expect(UsersModule).toBeDefined();
  });
});
