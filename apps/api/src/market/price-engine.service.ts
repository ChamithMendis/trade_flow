import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import {
  InstrumentStatus,
  type PriceUpdatePayload,
} from '@tradeflow/shared-types';
import { EventsService } from '../events/events.service';
import { PrismaService } from '../prisma/prisma.service';

const INTERVAL_NAME = 'market-price-tick';

/** Largest move a single tick can make, as a fraction of the current price. */
const VOLATILITY = 0.01;

/** Prices are simulated but should never go to zero. */
const MIN_PRICE = 1;

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/**
 * Generates simulated price movement: on every tick each active instrument takes
 * one step of a bounded random walk, the new price is persisted, and a
 * `market.price.updated` event is broadcast.
 */
@Injectable()
export class PriceEngineService implements OnModuleInit {
  private readonly logger = new Logger(PriceEngineService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly config: ConfigService,
    private readonly scheduler: SchedulerRegistry,
  ) {}

  onModuleInit(): void {
    const tickMs = Number(this.config.get<string>('MARKET_TICK_MS') ?? 3000);
    if (tickMs <= 0) {
      this.logger.warn('MARKET_TICK_MS <= 0 — price engine disabled');
      return;
    }

    const interval = setInterval(() => void this.tick(), tickMs);
    this.scheduler.addInterval(INTERVAL_NAME, interval);
    this.logger.log(`Price engine running every ${tickMs}ms`);
  }

  async tick(): Promise<void> {
    // Skip if the previous tick is still in flight (slow DB, long GC pause).
    if (this.running) return;
    this.running = true;

    try {
      const instruments = await this.prisma.instrument.findMany({
        where: { status: InstrumentStatus.ACTIVE },
      });
      if (instruments.length === 0) return;

      const moves = instruments.map((instrument) => {
        const previousPrice = Number(instrument.currentPrice);
        const drift = (Math.random() * 2 - 1) * VOLATILITY;
        const price = Math.max(MIN_PRICE, round4(previousPrice * (1 + drift)));
        return {
          id: instrument.id,
          symbol: instrument.symbol,
          previousPrice,
          price,
        };
      });

      await this.prisma.$transaction(
        moves.map((move) =>
          this.prisma.instrument.update({
            where: { id: move.id },
            data: { currentPrice: move.price },
          }),
        ),
      );

      const at = new Date().toISOString();
      for (const move of moves) {
        const change = round4(move.price - move.previousPrice);
        const payload: PriceUpdatePayload = {
          symbol: move.symbol,
          price: move.price,
          previousPrice: move.previousPrice,
          change,
          changePercent:
            move.previousPrice === 0
              ? 0
              : round4((change / move.previousPrice) * 100),
          at,
        };
        this.events.emitPriceUpdate(payload);
      }
    } catch (error) {
      // A failed tick must never kill the interval.
      this.logger.error(
        'Price tick failed',
        error instanceof Error ? error.stack : error,
      );
    } finally {
      this.running = false;
    }
  }
}
