import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { join } from 'path';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { S3Module } from './s3/s3.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { BooksModule } from './books/books.module';
import { TranslationModule } from './translation/translation.module';
import { PaymentModule } from './payment/payment.module';
import { ReaderModule } from './reader/reader.module';
import { TtsModule } from './tts/tts.module';
import { NotificationModule } from './notification/notification.module';
import { HealthController } from './health.controller';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Resolve .env relative to the module file so it loads regardless of CWD
      // (handles Turbo, integration tests, and other non-apps/api invocations).
      envFilePath: [join(__dirname, '..', '.env'), '.env'],
    }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000,
        limit: process.env.NODE_ENV === 'production' ? 100 : 10000,
      },
      {
        name: 'upload',
        ttl: 900000, // 15 minutes
        limit: process.env.NODE_ENV === 'production' ? 5 : 10000,
      },
      {
        // Per-IP cap for login attempts. The auth service already throttles by
        // email, but an attacker rotating the email field can bypass that —
        // this catches IP-level brute-force / credential-stuffing.
        name: 'auth-login',
        ttl: 60000,
        limit: process.env.NODE_ENV === 'production' ? 20 : 10000,
      },
      {
        // Per-IP cap for OTP sends to limit SMS-cost amplification attacks.
        name: 'auth-otp',
        ttl: 60000,
        limit: process.env.NODE_ENV === 'production' ? 5 : 10000,
      },
    ]),
    PrismaModule,
    RedisModule,
    S3Module,
    AuthModule,
    UsersModule,
    BooksModule,
    TranslationModule,
    PaymentModule,
    ReaderModule,
    TtsModule,
    NotificationModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
