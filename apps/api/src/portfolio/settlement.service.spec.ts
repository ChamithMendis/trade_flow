import { Logger } from '@nestjs/common';
import { OrderSide } from '@tradeflow/shared-types';
import type { Prisma } from '../generated/prisma/client';
import { SettlementService } from './settlement.service';

interface Options {
  cash?: number;
  /** Existing position, if the trader already holds the instrument. */
  position?: { id: string; quantity: number; averagePrice: number } | null;
  portfolioMissing?: boolean;
}

function setup(options: Options = {}) {
  const { cash = 100_000, position = null, portfolioMissing = false } = options;

  const updatePortfolio = jest.fn().mockResolvedValue({});
  const createPosition = jest.fn().mockResolvedValue({});
  const updatePosition = jest.fn().mockResolvedValue({});
  const deletePosition = jest.fn().mockResolvedValue({});

  // $queryRaw serves both locked reads: portfolio first, then position.
  const queryRaw = jest
    .fn()
    .mockResolvedValueOnce(
      portfolioMissing ? [] : [{ id: 'p1', availableCash: cash }],
    )
    .mockResolvedValue(position ? [position] : []);

  const tx = {
    $queryRaw: queryRaw,
    portfolio: { update: updatePortfolio },
    position: {
      findUnique: jest.fn().mockResolvedValue(position),
      create: createPosition,
      update: updatePosition,
      delete: deletePosition,
    },
  } as unknown as Prisma.TransactionClient;

  return {
    service: new SettlementService(),
    tx,
    updatePortfolio,
    createPosition,
    updatePosition,
    deletePosition,
  };
}

function dataOf(mock: jest.Mock): Record<string, number> {
  const calls = mock.mock.calls as [{ data: Record<string, number> }][];
  return calls[0][0].data;
}

const buy = (quantity: number, executionPrice: number) => ({
  userId: 'u1',
  instrumentId: 'i1',
  side: OrderSide.BUY,
  quantity,
  executionPrice,
});

const sell = (quantity: number, executionPrice: number) => ({
  ...buy(quantity, executionPrice),
  side: OrderSide.SELL,
});

describe('SettlementService — buying', () => {
  it('debits cash and opens a new position at the execution price', async () => {
    const { service, tx, updatePortfolio, createPosition } = setup({
      cash: 100_000,
    });

    await service.settle(tx, buy(10, 250));

    expect(dataOf(updatePortfolio).availableCash).toBe(97_500);
    expect(dataOf(createPosition)).toMatchObject({
      quantity: 10,
      averagePrice: 250,
    });
  });

  it('rolls a second buy into a weighted average cost', async () => {
    // Holding 10 @ 100, buying 10 @ 200 -> 20 @ 150.
    const { service, tx, updatePosition } = setup({
      position: { id: 'pos1', quantity: 10, averagePrice: 100 },
    });

    await service.settle(tx, buy(10, 200));

    expect(dataOf(updatePosition)).toMatchObject({
      quantity: 20,
      averagePrice: 150,
    });
  });

  it('rounds the average to 4 decimals', async () => {
    // 3 @ 100 then 1 @ 101 -> 401/4 = 100.25 exactly; use thirds to force rounding.
    const { service, tx, updatePosition } = setup({
      position: { id: 'pos1', quantity: 3, averagePrice: 100 },
    });

    await service.settle(tx, buy(1, 101.5));

    const { averagePrice } = dataOf(updatePosition);
    expect(averagePrice).toBeCloseTo(100.375, 4);
    expect(Number.isInteger(averagePrice * 10_000)).toBe(true);
  });
});

describe('SettlementService — selling', () => {
  it('credits cash and reduces the position, leaving average cost alone', async () => {
    const { service, tx, updatePortfolio, updatePosition } = setup({
      cash: 50_000,
      position: { id: 'pos1', quantity: 10, averagePrice: 100 },
    });

    await service.settle(tx, sell(4, 120));

    expect(dataOf(updatePortfolio).availableCash).toBe(50_480);
    expect(dataOf(updatePosition)).toEqual({ quantity: 6 });
  });

  it('deletes the position once it is flat', async () => {
    const { service, tx, deletePosition, updatePosition } = setup({
      position: { id: 'pos1', quantity: 5, averagePrice: 100 },
    });

    await service.settle(tx, sell(5, 110));

    expect(deletePosition).toHaveBeenCalledWith({ where: { id: 'pos1' } });
    expect(updatePosition).not.toHaveBeenCalled();
  });

  it('logs and stops when there is no position to sell from', async () => {
    const logged = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const { service, tx, updatePosition, deletePosition } = setup({
      position: null,
    });

    await service.settle(tx, sell(5, 110));

    expect(updatePosition).not.toHaveBeenCalled();
    expect(deletePosition).not.toHaveBeenCalled();
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});

describe('SettlementService — guards', () => {
  it('does nothing when the trader has no portfolio', async () => {
    const logged = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const { service, tx, updatePortfolio } = setup({ portfolioMissing: true });

    await service.settle(tx, buy(1, 100));

    expect(updatePortfolio).not.toHaveBeenCalled();
    logged.mockRestore();
  });

  it('round-trips a buy and a matching sell back to the starting cash', async () => {
    const bought = setup({ cash: 10_000 });
    await bought.service.settle(bought.tx, buy(10, 100));
    expect(dataOf(bought.updatePortfolio).availableCash).toBe(9_000);

    const sold = setup({
      cash: 9_000,
      position: { id: 'pos1', quantity: 10, averagePrice: 100 },
    });
    await sold.service.settle(sold.tx, sell(10, 100));
    expect(dataOf(sold.updatePortfolio).availableCash).toBe(10_000);
  });
});
