/**
 * Shared enums and contract types used by both the API and the web app.
 * Keep this package free of runtime dependencies.
 */

export enum UserRole {
  TRADER = 'TRADER',
  ADMIN = 'ADMIN',
}

export enum InstrumentStatus {
  ACTIVE = 'ACTIVE',
  DISABLED = 'DISABLED',
}

export enum OrderSide {
  BUY = 'BUY',
  SELL = 'SELL',
}

export enum OrderType {
  MARKET = 'MARKET',
  LIMIT = 'LIMIT',
}

export enum OrderStatus {
  NEW = 'NEW',
  PROCESSING = 'PROCESSING',
  PARTIALLY_FILLED = 'PARTIALLY_FILLED',
  FILLED = 'FILLED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

/** Virtual cash every new trader (and the seeded admin) starts with. */
export const STARTING_CASH = 100_000;

/** Terminal states an order can no longer move out of. */
export const TERMINAL_ORDER_STATUSES: readonly OrderStatus[] = [
  OrderStatus.FILLED,
  OrderStatus.REJECTED,
  OrderStatus.CANCELLED,
];

export enum OrderEventType {
  CREATED = 'CREATED',
  PROCESSING = 'PROCESSING',
  PARTIALLY_FILLED = 'PARTIALLY_FILLED',
  FILLED = 'FILLED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

/** Socket.IO event names. Keep in sync with the API gateway and web listeners. */
export const WsEvent = {
  MARKET_PRICE_UPDATED: 'market.price.updated',
  ORDER_CREATED: 'order.created',
  ORDER_UPDATED: 'order.updated',
  ORDER_PARTIALLY_FILLED: 'order.partially_filled',
  ORDER_FILLED: 'order.filled',
  ORDER_REJECTED: 'order.rejected',
  ORDER_CANCELLED: 'order.cancelled',
  PORTFOLIO_UPDATED: 'portfolio.updated',
} as const;

export type WsEventName = (typeof WsEvent)[keyof typeof WsEvent];

// ---------------------------------------------------------------------------
// Auth contracts (REST)
// ---------------------------------------------------------------------------

/** The authenticated user shape returned by the API (never includes the hash). */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

export interface AuthResponse {
  accessToken: string;
  user: AuthUser;
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}
