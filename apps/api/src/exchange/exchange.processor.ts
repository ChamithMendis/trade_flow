import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OrderEventType,
  OrderSide,
  OrderStatus,
  OrderType,
  WsEvent,
  isOpenOrderStatus,
} from '@tradeflow/shared-types';
import type { Job } from 'bullmq';
import { EventsService } from '../events/events.service';
import { OrderNotifier } from '../events/order-notifier.service';
import { PrismaService } from '../prisma/prisma.service';
import { EXCHANGE_QUEUE, type ProcessOrderJobData } from './exchange.constants';
import { ExchangeProducer } from './exchange.producer';
import { ExecutionService } from './execution.service';

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * The simulated exchange. Each job applies **one** execution slice and, if the
 * order still has quantity left, queues a delayed continuation. Splitting the
 * work this way keeps the worker free between fills instead of sleeping inside
 * a single long job, and every step is independently retryable.
 */
@Processor(EXCHANGE_QUEUE)
export class ExchangeProcessor extends WorkerHost {
  private readonly logger = new Logger(ExchangeProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly executions: ExecutionService,
    private readonly producer: ExchangeProducer,
    private readonly notifier: OrderNotifier,
    private readonly events: EventsService,
    private readonly config: ConfigService,
  ) {
    super();
  }

  private get rejectRate(): number {
    return Number(this.config.get<string>('EXCHANGE_REJECT_RATE') ?? 0.1);
  }

  private get minDelayMs(): number {
    return Number(this.config.get<string>('EXCHANGE_MIN_DELAY_MS') ?? 800);
  }

  private get maxDelayMs(): number {
    return Number(this.config.get<string>('EXCHANGE_MAX_DELAY_MS') ?? 2_500);
  }

  async process(job: Job<ProcessOrderJobData>): Promise<string> {
    const { orderId } = job.data;

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { instrument: true },
    });
    if (!order) {
      return 'order-missing';
    }
    if (!isOpenOrderStatus(order.status as OrderStatus)) {
      // Cancelled while queued, or already finished.
      return `skipped:${order.status}`;
    }

    // A brand-new order either gets rejected outright or moves to PROCESSING.
    // Both transitions are conditional on the order still being NEW: a cancel
    // may have committed since the read above, and an unconditional update
    // would bring the order back to life.
    if ((order.status as OrderStatus) === OrderStatus.NEW) {
      if (Math.random() < this.rejectRate) {
        return (await this.reject(orderId))
          ? 'rejected'
          : 'skipped:no-longer-new';
      }
      if (!(await this.markProcessing(orderId))) {
        return 'skipped:no-longer-new';
      }
    }

    const remaining = order.quantity - order.filledQuantity;
    const sequence = await this.executions.countExecutions(orderId);
    const quantity = this.nextSliceSize(remaining);
    const executionPrice = this.executionPrice(order);

    const result = await this.executions.applyExecution({
      orderId,
      quantity,
      executionPrice,
      executionReference: `${orderId}:${sequence}`,
    });

    if (!result.applied) {
      return `not-applied:${result.reason}`;
    }

    await this.notifier.notify(
      orderId,
      result.status === OrderStatus.FILLED
        ? WsEvent.ORDER_FILLED
        : WsEvent.ORDER_PARTIALLY_FILLED,
    );
    // The execution moved cash and positions, so the portfolio is stale too.
    this.events.emitPortfolioUpdated(result.userId);

    if (result.status === OrderStatus.PARTIALLY_FILLED) {
      // Queue the next slice; the job id is keyed on the new execution count so
      // a retry of this job cannot enqueue a second continuation.
      await this.producer.enqueueOrder(
        orderId,
        sequence + 1,
        Math.round(randomBetween(this.minDelayMs, this.maxDelayMs)),
      );
      return `partial:${result.filledQuantity}/${result.quantity}`;
    }

    return `filled:${result.quantity}`;
  }

  /**
   * Fill the whole remainder about 40% of the time; otherwise take a 25–75%
   * bite so orders visibly move through PARTIALLY_FILLED.
   */
  private nextSliceSize(remaining: number): number {
    if (remaining <= 1 || Math.random() < 0.4) {
      return remaining;
    }
    const slice = Math.ceil(remaining * randomBetween(0.25, 0.75));
    return Math.min(remaining, Math.max(1, slice));
  }

  /**
   * MARKET fills at the live price with a little slippage. LIMIT never fills
   * worse than its limit — there is no order book here, so the price is clamped
   * rather than left resting (the spec rules out a real matching engine).
   */
  private executionPrice(order: {
    orderType: string;
    side: string;
    price: unknown;
    instrument: { currentPrice: unknown };
  }): number {
    const market = Number(order.instrument.currentPrice);
    const slipped = market * randomBetween(0.999, 1.001);

    if (
      (order.orderType as OrderType) !== OrderType.LIMIT ||
      order.price === null
    ) {
      return round4(slipped);
    }

    const limit = Number(order.price);
    return round4(
      (order.side as OrderSide) === OrderSide.BUY
        ? Math.min(slipped, limit)
        : Math.max(slipped, limit),
    );
  }

  /** Returns false if the order stopped being NEW before we got here. */
  private async markProcessing(orderId: string): Promise<boolean> {
    const accepted = await this.transitionFromNew(
      orderId,
      OrderStatus.PROCESSING,
      OrderEventType.PROCESSING,
      { acceptedAt: new Date().toISOString() },
    );
    if (accepted) {
      await this.notifier.notify(orderId, WsEvent.ORDER_UPDATED);
    }
    return accepted;
  }

  /** Returns false if the order stopped being NEW before we got here. */
  private async reject(orderId: string): Promise<boolean> {
    const rejected = await this.transitionFromNew(
      orderId,
      OrderStatus.REJECTED,
      OrderEventType.REJECTED,
      { reason: 'Rejected by exchange simulator' },
    );
    if (rejected) {
      this.logger.log(`Order ${orderId} rejected`);
      await this.notifier.notify(orderId, WsEvent.ORDER_REJECTED);
    }
    return rejected;
  }

  /**
   * `updateMany` with a status filter compiles to `UPDATE ... WHERE status =
   * 'NEW'`, so the guard and the write are one atomic statement. The event is
   * only written if that statement actually matched a row.
   */
  private async transitionFromNew(
    orderId: string,
    status: OrderStatus,
    eventType: OrderEventType,
    payload: Record<string, string>,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.order.updateMany({
        where: { id: orderId, status: OrderStatus.NEW },
        data: { status },
      });
      if (count === 0) {
        return false;
      }
      await tx.orderEvent.create({ data: { orderId, eventType, payload } });
      return true;
    });
  }
}
