import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const { method, url } = req;
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const res = context.switchToHttp().getResponse();
          const duration = Date.now() - start;
          this.logger.log(`${method} ${url} ${res.statusCode} ${duration}ms`);
        },
        error: (error) => {
          const duration = Date.now() - start;
          const status = error?.status || 500;
          this.logger.error(`${method} ${url} ${status} ${duration}ms — ${error?.message}`);
        },
      }),
    );
  }
}
