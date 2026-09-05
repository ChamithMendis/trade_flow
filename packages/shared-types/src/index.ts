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

// ---------------------------------------------------------------------------
// Market contracts
// ---------------------------------------------------------------------------

/** Socket.IO room every authenticated client joins to receive market data. */
export const MARKET_ROOM = 'market';

/** Private room a client joins so it only ever sees its own order events. */
export function userRoom(userId: string): string {
  return `user:${userId}`;
}

export interface InstrumentDto {
  id: string;
  symbol: string;
  name: string;
  currentPrice: number;
  status: InstrumentStatus;
  updatedAt: string;
}

/** Payload of the `market.price.updated` event. */
export interface PriceUpdatePayload {
  symbol: string;
  price: number;
  previousPrice: number;
  change: number;
  changePercent: number;
  at: string;
}

// ---------------------------------------------------------------------------
// Order contracts
// ---------------------------------------------------------------------------

/** Statuses an order can still move out of — i.e. it is still cancellable. */
export const OPEN_ORDER_STATUSES: readonly OrderStatus[] = [
  OrderStatus.NEW,
  OrderStatus.PROCESSING,
  OrderStatus.PARTIALLY_FILLED,
];

export function isOpenOrderStatus(status: OrderStatus): boolean {
  return OPEN_ORDER_STATUSES.includes(status);
}

export interface ExecutionDto {
  id: string;
  quantity: number;
  executionPrice: number;
  executionReference: string;
  executionTime: string;
}

export interface OrderEventDto {
  id: string;
  eventType: OrderEventType;
  payload: unknown;
  createdAt: string;
}

export interface OrderDto {
  id: string;
  instrumentId: string;
  symbol: string;
  instrumentName: string;
  side: OrderSide;
  orderType: OrderType;
  quantity: number;
  filledQuantity: number;
  /** Limit price; null for MARKET orders. */
  price: number | null;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
}

/** `GET /orders/:id` — the order plus its execution and event history. */
export interface OrderDetailDto extends OrderDto {
  executions: ExecutionDto[];
  events: OrderEventDto[];
}

/**
 * Order events all carry the full order, so a client can drop it straight into
 * its cache rather than patching fields.
 */
export type OrderEventName =
  | typeof WsEvent.ORDER_CREATED
  | typeof WsEvent.ORDER_UPDATED
  | typeof WsEvent.ORDER_PARTIALLY_FILLED
  | typeof WsEvent.ORDER_FILLED
  | typeof WsEvent.ORDER_REJECTED
  | typeof WsEvent.ORDER_CANCELLED;

export const ORDER_EVENT_NAMES: readonly OrderEventName[] = [
  WsEvent.ORDER_CREATED,
  WsEvent.ORDER_UPDATED,
  WsEvent.ORDER_PARTIALLY_FILLED,
  WsEvent.ORDER_FILLED,
  WsEvent.ORDER_REJECTED,
  WsEvent.ORDER_CANCELLED,
];

export interface CreateOrderRequest {
  symbol: string;
  side: OrderSide;
  orderType: OrderType;
  quantity: number;
  /** Required for LIMIT orders, omitted for MARKET. */
  price?: number;
}
