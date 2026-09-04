import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { MARKET_ROOM } from '@tradeflow/shared-types';
import type { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
    credentials: true,
  },
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(EventsGateway.name);

  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket): void {
    // Phase 3: market data is public, so every client joins the market room.
    // Phase 6 adds JWT verification here plus a private `user:<id>` room.
    void client.join(MARKET_ROOM);
    this.logger.debug(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`Client disconnected: ${client.id}`);
  }
}
