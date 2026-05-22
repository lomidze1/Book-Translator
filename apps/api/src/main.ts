import './sentry';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');

  // Compression
  app.use(compression());

  // Cookie parsing (required to read the httpOnly refresh-token cookie)
  app.use(cookieParser());

  // Security headers
  app.use(helmet());

  const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:3000';
  if (process.env.NODE_ENV === 'production' && !process.env.CORS_ORIGIN) {
    throw new Error('CORS_ORIGIN environment variable is required in production');
  }
  app.enableCors({
    origin: corsOrigin,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalInterceptors(new LoggingInterceptor());

  const port = process.env.PORT || 4000;
  await app.listen(port);
  console.log(`Book Translator API running on http://localhost:${port}`);
}

bootstrap();
