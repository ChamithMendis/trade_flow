import { useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { connectSocket, disconnectSocket } from './socket';

/**
 * Opens the socket while the trader is signed in and closes it on sign-out.
 * The server rejects an unauthenticated handshake, so connecting without a
 * token would just churn through failed reconnects.
 */
export function useSocketConnection(): void {
  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    if (!token) {
      disconnectSocket();
      return;
    }
    connectSocket();
    return () => disconnectSocket();
  }, [token]);
}
