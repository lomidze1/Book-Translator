import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { SocketAuthService } from '../auth/socket-auth.service';

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

  constructor(private readonly socketAuth: SocketAuthService) {}

  async handleConnection(client: Socket): Promise<void> {
    const userId = await this.socketAuth.authenticate(client, 'Notification');
    if (!userId) return;

    // Auto-join the user's personal room so emitNotification can target them.
    client.join(`user:${userId}`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Notification client disconnected: ${client.id}`);
  }

  emitNotification(userId: string, notification: unknown): void {
    this.server?.to(`user:${userId}`).emit('notification:new', notification);
  }

  emitUnreadCount(userId: string, count: number): void {
    this.server?.to(`user:${userId}`).emit('notification:unread-count', count);
  }
}
