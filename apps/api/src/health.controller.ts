import { Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {
  @Get()
  health() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'book-translator-api',
    };
  }
}
