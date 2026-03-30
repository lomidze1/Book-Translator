import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      // If a Bearer token is present, try to authenticate (populates request.user)
      const request = context.switchToHttp().getRequest();
      const authHeader = request.headers?.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        return super.canActivate(context);
      }
      return true;
    }

    return super.canActivate(context);
  }

  private isPublicRoute(context: ExecutionContext): boolean {
    return this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
  }

  handleRequest<T>(err: Error | null, user: T, info: Error | null, context: ExecutionContext): T {
    if (this.isPublicRoute(context)) {
      // On public routes, allow anonymous access even if token was invalid
      return user || (null as T);
    }

    if (err || !user) {
      throw err || new UnauthorizedException('Authentication required');
    }
    return user;
  }
}
