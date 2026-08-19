import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from './auth/decorators/public.decorator';
import { PrismaService } from './prisma/prisma.service';
import { RedisService } from './redis/redis.service';

@Controller()
@Public()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  // Railway polls this path. A flat 200 would keep an instance in rotation even
  // with a dead database, so both dependencies are probed for real.
  @Get()
  async health() {
    const [database, redis] = await Promise.all([this.checkDatabase(), this.checkRedis()]);

    const body = {
      status: database === 'ok' && redis === 'ok' ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      service: 'book-translator-api',
      dependencies: { database, redis },
    };

    if (body.status !== 'ok') {
      throw new ServiceUnavailableException(body);
    }
    return body;
  }

  private async checkDatabase(): Promise<'ok' | 'down'> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'ok';
    } catch {
      return 'down';
    }
  }

  private async checkRedis(): Promise<'ok' | 'down'> {
    try {
      return (await this.redis.ping()) ? 'ok' : 'down';
    } catch {
      return 'down';
    }
  }
}
