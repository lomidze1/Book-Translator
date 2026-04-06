import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  namespace: 'notifications',
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  },
})
export class NotificationGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(NotificationGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(private readonly jwtService: JwtService) {}

  handleConnection(client: Socket): void {
    try {
      const token =
        (client.handshake.auth as any)?.token ||
        (client.handshake.query?.token as string);

      if (!token) {
        this.logger.warn(`Notification client rejected (no token): ${client.id}`);
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token);
      const userId = payload.sub;
      (client as any).userId = userId;

      // Auto-join user's room
      client.join(`user:${userId}`);
      this.logger.log(`Notification client connected: ${client.id} (user: ${userId})`);
    } catch {
      this.logger.warn(`Notification client rejected (invalid token): ${client.id}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Notification client disconnected: ${client.id}`);
  }

  emitNotification(userId: string, notification: any): void {
    this.server?.to(`user:${userId}`).emit('notification:new', notification);
  }

  emitUnreadCount(userId: string, count: number): void {
    this.server?.to(`user:${userId}`).emit('notification:unread-count', count);
  }
}
