import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { SocketAuthService } from '../auth/socket-auth.service';

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
    private readonly socketAuth: SocketAuthService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    // SocketAuthService handles token extraction, JWT verify, tokenVersion
    // revocation check, and disconnects on failure. Returns null when the
    // client was rejected (already disconnected).
    await this.socketAuth.authenticate(client, 'TTS');
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`TTS client disconnected: ${client.id}`);
  }

  @SubscribeMessage('tts:subscribe')
  async handleSubscribe(client: Socket, audioBookId: string): Promise<void> {
    const userId = client.userId;
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
