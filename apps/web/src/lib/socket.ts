import { io, type Socket } from 'socket.io-client';
import { useAuthStore } from '@/stores/authStore';
import { env } from './env';

let socket: Socket | null = null;

/**
 * One shared Socket.IO connection. The server rejects any handshake without a
 * valid JWT, so `auth` is a callback — Socket.IO re-evaluates it on every
 * connection attempt, which means reconnects pick up the current token instead
 * of replaying a stale one.
 */
export function getSocket(): Socket {
  socket ??= io(env.wsUrl, {
    transports: ['websocket'],
    autoConnect: false,
    reconnectionDelay: 1000,
    auth: (cb) => cb({ token: useAuthStore.getState().token ?? '' }),
  });
  return socket;
}

export function connectSocket(): void {
  const s = getSocket();
  if (!s.connected) s.connect();
}

export function disconnectSocket(): void {
  socket?.disconnect();
}
