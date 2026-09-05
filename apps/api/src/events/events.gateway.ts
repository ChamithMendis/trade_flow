import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { MARKET_ROOM, userRoom } from '@tradeflow/shared-types';
import type { Server, Socket } from 'socket.io';
import type { JwtPayload } from '../auth/jwt.strategy';

/** What we hang off `socket.data` once we know who is on the other end. */
interface SocketData {
  userId?: string;
}

/** `Socket['data']` is typed `any`; this is the one place we narrow it. */
function socketData(client: Socket): SocketData {
  return client.data as SocketData;
}

@WebSocketGateway({
  cors: {
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
    credentials: true,
  },
})
export class EventsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(EventsGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(private readonly jwt: JwtService) {}

  /**
   * Auth runs as connection middleware, not in `handleConnection`. Middleware
   * refuses the handshake outright and the client sees `connect_error`;
   * disconnecting inside `handleConnection` would let the connection open first
   * and only then tear it down.
   */
  afterInit(server: Server): void {
    server.use((socket, next) => {
      const token = this.extractToken(socket);
      if (!token) {
        next(new Error('Unauthorized: missing token'));
        return;
      }
      try {
        const payload = this.jwt.verify<JwtPayload>(token);
        socketData(socket).userId = payload.sub;
        next();
      } catch {
        next(new Error('Unauthorized: invalid token'));
      }
    });
  }

  /**
   * The client joins the shared market room plus a private `user:<id>` room, so
   * order events are addressed to one trader and never broadcast (spec §14).
   */
  handleConnection(client: Socket): void {
    const { userId } = socketData(client);
    if (!userId) {
      // Middleware should have stopped this; refuse rather than leak events.
      client.disconnect(true);
      return;
    }

    void client.join(MARKET_ROOM);
    void client.join(userRoom(userId));
    this.logger.debug(`Client connected: ${client.id} (user ${userId})`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  private extractToken(client: Socket): string | undefined {
    const fromAuth = client.handshake.auth?.token as unknown;
    if (typeof fromAuth === 'string' && fromAuth.length > 0) {
      return fromAuth;
    }
    // Fallback for clients that can only set headers.
    const header = client.handshake.headers.authorization;
    return header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  }
}
