import { Injectable } from '@nestjs/common';
import type { OrderEventName } from '@tradeflow/shared-types';
import { toOrderDto } from '../orders/order.mapper';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from './events.service';

/**
 * Loads an order and pushes it to its owner's private room. Both Orders and
 * Exchange use this, so there is exactly one place that knows how an order
 * event is shaped.
 *
 * It lives in `events/` rather than `orders/` on purpose: OrdersModule already
 * imports ExchangeModule, so putting it in `orders/` would make the two modules
 * circular. Importing the pure `toOrderDto` mapper creates no such cycle.
 */
@Injectable()
export class OrderNotifier {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
  ) {}

  /** Call only after the surrounding transaction has committed. */
  async notify(orderId: string, event: OrderEventName): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { instrument: { select: { symbol: true, name: true } } },
    });
    if (!order) return;

    this.events.emitOrderEvent(order.userId, event, toOrderDto(order));
  }
}
