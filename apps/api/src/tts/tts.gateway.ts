import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';

@WebSocketGateway({
  namespace: 'tts',
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  },
})
export class TtsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(TtsGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token =
        (client.handshake.auth as any)?.token ||
        (client.handshake.query?.token as string);

      if (!token) {
        this.logger.warn(`TTS client rejected (no token): ${client.id}`);
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token);

      // Match JwtStrategy: verify the token wasn't revoked by a password change
      // or logout-all (tokenVersion bump).
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { tokenVersion: true },
      });
      if (!user) {
        this.logger.warn(`TTS client rejected (user not found): ${client.id}`);
        client.disconnect();
        return;
      }
      if (payload.tokenVersion !== undefined && payload.tokenVersion !== user.tokenVersion) {
        this.logger.warn(`TTS client rejected (token revoked): ${client.id}`);
        client.disconnect();
        return;
      }

      (client as any).userId = payload.sub;
      this.logger.log(`TTS client connected: ${client.id} (user: ${payload.sub})`);
    } catch {
      this.logger.warn(`TTS client rejected (invalid token): ${client.id}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`TTS client disconnected: ${client.id}`);
  }

  @SubscribeMessage('tts:subscribe')
  async handleSubscribe(client: Socket, audioBookId: string): Promise<void> {
    const userId = (client as any).userId;
    if (!userId) {
      client.disconnect();
      return;
    }

    // Verify ownership before joining room
    const audioBook = await this.prisma.audioBook.findUnique({
      where: { id: audioBookId },
      include: { book: { include: { userBooks: { where: { userId } } } } },
    });

    if (!audioBook || audioBook.book.userBooks.length === 0) {
      client.emit('tts:error', { error: 'არ გაქვთ ამ აუდიოზე წვდომა' });
      return;
    }

    client.join(`audio:${audioBookId}`);
  }

  @SubscribeMessage('tts:unsubscribe')
  handleUnsubscribe(client: Socket, audioBookId: string): void {
    client.leave(`audio:${audioBookId}`);
  }

  emitProgress(audioBookId: string, data: {
    chapterNumber: number;
    chunkProgress: number;
    overallProgress: number;
  }): void {
    this.server?.to(`audio:${audioBookId}`).emit('tts:progress', data);
  }

  emitChapterDone(audioBookId: string, data: {
    chapterNumber: number;
    audioUrl: string;
    duration: number;
  }): void {
    this.server?.to(`audio:${audioBookId}`).emit('tts:chapter-done', data);
  }

  emitCompleted(audioBookId: string, data: {
    totalDuration: number;
    totalSize: number;
  }): void {
    this.server?.to(`audio:${audioBookId}`).emit('tts:completed', data);
  }

  emitError(audioBookId: string, data: {
    chapterNumber?: number;
    error: string;
  }): void {
    this.server?.to(`audio:${audioBookId}`).emit('tts:error', data);
  }
}
