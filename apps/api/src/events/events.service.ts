import { Injectable } from '@nestjs/common';
import {
  MARKET_ROOM,
  WsEvent,
  userRoom,
  type OrderDto,
  type OrderEventName,
  type PriceUpdatePayload,
} from '@tradeflow/shared-types';
import { EventsGateway } from './events.gateway';

/**
 * The seam between business modules and the WebSocket transport. Market, Orders
 * and Exchange depend on this, never on the gateway itself, so the transport
 * can change without touching business code.
 */
@Injectable()
export class EventsService {
  constructor(private readonly gateway: EventsGateway) {}

  emitPriceUpdate(payload: PriceUpdatePayload): void {
    // `server` is undefined until the gateway has bootstrapped.
    this.gateway.server
      ?.to(MARKET_ROOM)
      .emit(WsEvent.MARKET_PRICE_UPDATED, payload);
  }

  /** Addressed to one trader's private room — never broadcast. */
  emitOrderEvent(userId: string, event: OrderEventName, order: OrderDto): void {
    this.gateway.server?.to(userRoom(userId)).emit(event, order);
  }

  /** Tells one trader their cash or positions moved. */
  emitPortfolioUpdated(userId: string): void {
    this.gateway.server?.to(userRoom(userId)).emit(WsEvent.PORTFOLIO_UPDATED);
  }
}
