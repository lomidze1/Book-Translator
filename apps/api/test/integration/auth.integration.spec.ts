import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Auth Integration Tests', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    // Cleanup test users
    await prisma.user.deleteMany({
      where: { email: { contains: '@integration-test.com' } },
    });
    await app.close();
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: 'test-register@integration-test.com',
          password: 'TestPass123',
          name: 'Integration Test',
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('userId');
    });

    it('should reject duplicate email', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: 'test-register@integration-test.com',
          password: 'TestPass123',
          name: 'Duplicate',
        });

      expect(res.status).toBe(409);
    });

    it('should reject weak password', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: 'weak-pass@integration-test.com',
          password: '123',
          name: 'Weak',
        });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login with correct credentials', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: 'test-register@integration-test.com',
          password: 'TestPass123',
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
      expect(res.body.user).toHaveProperty('email', 'test-register@integration-test.com');
    });

    it('should reject wrong password', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: 'test-register@integration-test.com',
          password: 'WrongPass123',
        });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/users/me', () => {
    it('should return 401 without token', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/users/me');

      expect(res.status).toBe(401);
    });

    it('should return user profile with valid token', async () => {
      // Login first
      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: 'test-register@integration-test.com',
          password: 'TestPass123',
        });

      const token = loginRes.body.accessToken;

      const res = await request(app.getHttpServer())
        .get('/api/users/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('email', 'test-register@integration-test.com');
      expect(res.body).toHaveProperty('name', 'Integration Test');
    });
  });

  describe('GET /api (health check)', () => {
    it('should return ok status', async () => {
      const res = await request(app.getHttpServer())
        .get('/api');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'ok');
      expect(res.body).toHaveProperty('timestamp');
    });
  });
});
