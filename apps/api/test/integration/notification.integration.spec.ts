import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Notification Integration Tests', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;

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

    // Create test user and login
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: 'notif-test@integration-test.com',
        password: 'TestPass123',
        name: 'Notif Test',
      });

    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'notif-test@integration-test.com',
        password: 'TestPass123',
      });

    accessToken = loginRes.body.accessToken;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { contains: '@integration-test.com' } },
    });
    await app.close();
  });

  describe('GET /api/notifications', () => {
    it('should return empty notification list', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/notifications')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('notifications');
      expect(res.body.notifications).toEqual([]);
      expect(res.body).toHaveProperty('total', 0);
    });

    it('should return 401 without token', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/notifications');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/notifications/unread-count', () => {
    it('should return zero unread count', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/notifications/unread-count')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ count: 0 });
    });
  });

  describe('GET /api/notifications/preferences', () => {
    it('should return default preferences', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/notifications/preferences')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.emailEnabled).toBe(true);
      expect(res.body.pushEnabled).toBe(true);
      expect(res.body.inAppEnabled).toBe(true);
    });
  });

  describe('PATCH /api/notifications/preferences', () => {
    it('should update preferences', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/notifications/preferences')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ emailEnabled: false, ttsCompleted: false });

      expect(res.status).toBe(200);
      expect(res.body.emailEnabled).toBe(false);
      expect(res.body.ttsCompleted).toBe(false);
      expect(res.body.pushEnabled).toBe(true);
    });
  });

  describe('PATCH /api/notifications/read-all', () => {
    it('should mark all as read (even with none)', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/notifications/read-all')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
    });
  });
});
