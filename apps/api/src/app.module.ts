import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000,
        limit: process.env.NODE_ENV === 'production' ? 100 : 500,
      },
      {
        name: 'upload',
        ttl: 900000, // 15 minutes
        limit: 5,
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
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
