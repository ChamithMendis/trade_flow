import { io, type Socket } from 'socket.io-client';
import { env } from './env';

let socket: Socket | null = null;

/**
 * One shared Socket.IO connection for the whole app. Phase 6 will attach the
 * JWT here so the server can put the client in its private `user:<id>` room.
 */
export function getSocket(): Socket {
  socket ??= io(env.wsUrl, {
    transports: ['websocket'],
    reconnectionDelay: 1000,
  });
  return socket;
}
