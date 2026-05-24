import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Slot we hang on the socket.io client to remember the authenticated user.
 * Replaces the `(client as any).userId` cast that both gateways used to do.
 *
 * Augment the socket.io Socket type so all gateways share the same shape.
 */
declare module 'socket.io' {
  interface Socket {
    userId?: string;
  }
}

export interface AuthenticatedSocket extends Socket {
  userId: string;
}

/**
 * Shared WebSocket handshake authentication used by every gateway.
 *
 * Before this service existed, `tts.gateway.ts` and `notification.gateway.ts`
 * each carried their own copy of the same five-step handshake:
 *
 *   1. Pull the JWT from auth.token / query.token
 *   2. jwtService.verify()
 *   3. Look up the user by sub
 *   4. Compare payload.tokenVersion against the live row (revocation check)
 *   5. Attach userId to the socket
 *
 * The two copies were already drifting in subtle ways (log prefixes, error
 * messages). Centralising here means future changes — e.g. moving to an
 * httpOnly cookie handshake, or surfacing tokenVersion mismatches as a
 * specific event — land in one place.
 */
@Injectable()
export class SocketAuthService {
  private readonly logger = new Logger(SocketAuthService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Authenticate a connecting socket. On success returns the userId AND
   * mutates the client to carry it. On failure logs a structured warning,
   * disconnects the client, and returns null so the gateway can early-exit.
   *
   * @param client       The socket.io client from handleConnection().
   * @param scope        A short label (e.g. 'tts', 'notifications') used only
   *                     in log messages so failures stay attributable.
   */
  async authenticate(client: Socket, scope: string): Promise<string | null> {
    const token = this.extractToken(client);
    if (!token) {
      this.logger.warn(`${scope} client rejected (no token): ${client.id}`);
      client.disconnect();
      return null;
    }

    let payload: { sub?: string; tokenVersion?: number };
    try {
      payload = this.jwtService.verify(token);
    } catch {
      this.logger.warn(`${scope} client rejected (invalid token): ${client.id}`);
      client.disconnect();
      return null;
    }

    if (!payload.sub) {
      this.logger.warn(`${scope} client rejected (missing sub): ${client.id}`);
      client.disconnect();
      return null;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { tokenVersion: true },
    });
    if (!user) {
      this.logger.warn(`${scope} client rejected (user not found): ${client.id}`);
      client.disconnect();
      return null;
    }

    // Revocation check: mirrors JwtStrategy. tokenVersion is bumped on
    // password change and logout-all.
    if (payload.tokenVersion !== undefined && payload.tokenVersion !== user.tokenVersion) {
      this.logger.warn(`${scope} client rejected (token revoked): ${client.id}`);
      client.disconnect();
      return null;
    }

    client.userId = payload.sub;
    this.logger.log(`${scope} client connected: ${client.id} (user: ${payload.sub})`);
    return payload.sub;
  }

  private extractToken(client: Socket): string | null {
    const fromAuth = (client.handshake.auth as { token?: unknown } | undefined)?.token;
    if (typeof fromAuth === 'string' && fromAuth) return fromAuth;

    const fromQuery = client.handshake.query?.token;
    if (typeof fromQuery === 'string' && fromQuery) return fromQuery;

    return null;
  }
}
