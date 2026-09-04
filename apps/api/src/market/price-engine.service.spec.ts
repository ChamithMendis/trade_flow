import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import type { PriceUpdatePayload } from '@tradeflow/shared-types';
import { EventsService } from '../events/events.service';
import { PrismaService } from '../prisma/prisma.service';
import { PriceEngineService } from './price-engine.service';

describe('PriceEngineService', () => {
  function setup(
    instruments: { id: string; symbol: string; currentPrice: number }[],
  ) {
    const emitted: PriceUpdatePayload[] = [];
    const findMany = jest.fn().mockResolvedValue(instruments);
    const transaction = jest.fn().mockResolvedValue([]);

    const prisma = {
      instrument: { findMany, update: jest.fn() },
      $transaction: transaction,
    } as unknown as PrismaService;

    const events = {
      emitPriceUpdate: (payload: PriceUpdatePayload) => emitted.push(payload),
    } as unknown as EventsService;

    const config = { get: () => '3000' } as unknown as ConfigService;
    const scheduler = {
      addInterval: jest.fn(),
    } as unknown as SchedulerRegistry;

    return {
      service: new PriceEngineService(prisma, events, config, scheduler),
      emitted,
      findMany,
      transaction,
    };
  }

  it('moves every active instrument by no more than 1% per tick', async () => {
    const { service, emitted } = setup([
      { id: 'i1', symbol: 'TFLX', currentPrice: 100 },
      { id: 'i2', symbol: 'NOVA', currentPrice: 75 },
    ]);

    // Many ticks, because the move is random.
    for (let i = 0; i < 50; i += 1) await service.tick();

    expect(emitted).toHaveLength(100);
    for (const payload of emitted) {
      const movePercent = Math.abs(
        (payload.price - payload.previousPrice) / payload.previousPrice,
      );
      expect(movePercent).toBeLessThanOrEqual(0.01);
      expect(payload.price).toBeGreaterThanOrEqual(1);
    }
  });

  it('persists all instruments in a single transaction per tick', async () => {
    const { service, transaction } = setup([
      { id: 'i1', symbol: 'TFLX', currentPrice: 100 },
      { id: 'i2', symbol: 'NOVA', currentPrice: 75 },
    ]);

    await service.tick();

    expect(transaction).toHaveBeenCalledTimes(1);
    const [updates] = transaction.mock.calls[0] as [unknown[]];
    expect(updates).toHaveLength(2);
  });

  it('emits nothing when there are no active instruments', async () => {
    const { service, emitted, transaction } = setup([]);

    await service.tick();

    expect(emitted).toHaveLength(0);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('swallows a failed tick so the interval survives', async () => {
    const { service, findMany } = setup([
      { id: 'i1', symbol: 'TFLX', currentPrice: 100 },
    ]);
    findMany.mockRejectedValueOnce(new Error('db down'));
    const logged = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    await expect(service.tick()).resolves.toBeUndefined();

    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});
