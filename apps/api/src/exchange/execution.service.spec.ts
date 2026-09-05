import { Logger } from '@nestjs/common';
import { OrderSide, OrderStatus } from '@tradeflow/shared-types';
import { SettlementService } from '../portfolio/settlement.service';
import { PrismaService } from '../prisma/prisma.service';
import { ExecutionService } from './execution.service';

/** Mimics the unique-constraint error Prisma raises for executionReference. */
class UniqueViolation extends Error {
  code = 'P2002';
}

interface Options {
  order?: {
    id: string;
    status: OrderStatus;
    quantity: number;
    filledQuantity: number;
    side: OrderSide;
    userId: string;
    instrumentId: string;
  } | null;
  executionThrows?: Error;
}

function setup(options: Options = {}) {
  const {
    order = {
      id: 'o1',
      status: OrderStatus.PROCESSING,
      quantity: 10,
      filledQuantity: 0,
      side: OrderSide.BUY,
      userId: 'u1',
      instrumentId: 'i1',
    },
    executionThrows,
  } = options;

  const createExecution = executionThrows
    ? jest.fn().mockRejectedValue(executionThrows)
    : jest.fn().mockResolvedValue({});
  const updateOrder = jest.fn().mockResolvedValue({});
  const createEvent = jest.fn().mockResolvedValue({});

  const tx = {
    // The service locks the row with `SELECT ... FOR UPDATE`, which returns an array.
    $queryRaw: jest.fn().mockResolvedValue(order ? [order] : []),
    order: { update: updateOrder },
    execution: { create: createExecution },
    orderEvent: { create: createEvent },
  };

  const prisma = {
    $transaction: (fn: (client: typeof tx) => unknown) => fn(tx),
    execution: { count: jest.fn().mockResolvedValue(0) },
  } as unknown as PrismaService;

  const settle = jest.fn().mockResolvedValue(undefined);
  const settlement = { settle } as unknown as SettlementService;

  return {
    service: new ExecutionService(prisma, settlement),
    updateOrder,
    createEvent,
    createExecution,
    settle,
  };
}

function updateArg(mock: jest.Mock): Record<string, unknown> {
  const calls = mock.mock.calls as [{ data: Record<string, unknown> }][];
  return calls[0][0].data;
}

function eventArg(mock: jest.Mock): Record<string, unknown> {
  const calls = mock.mock.calls as [{ data: Record<string, unknown> }][];
  return calls[0][0].data;
}

const input = {
  orderId: 'o1',
  quantity: 4,
  executionPrice: 100,
  executionReference: 'o1:0',
};

describe('ExecutionService', () => {
  it('applies a partial fill and advances filledQuantity', async () => {
    const { service, updateOrder, createEvent } = setup();

    const result = await service.applyExecution(input);

    expect(result).toMatchObject({
      applied: true,
      status: OrderStatus.PARTIALLY_FILLED,
    });
    expect(updateArg(updateOrder)).toMatchObject({
      filledQuantity: 4,
      status: OrderStatus.PARTIALLY_FILLED,
    });
    expect(eventArg(createEvent).eventType).toBe('PARTIALLY_FILLED');
  });

  it('marks the order FILLED once the last share is executed', async () => {
    const { service, updateOrder, createEvent } = setup({
      order: {
        id: 'o1',
        status: OrderStatus.PARTIALLY_FILLED,
        quantity: 10,
        filledQuantity: 6,
        side: OrderSide.BUY,
        userId: 'u1',
        instrumentId: 'i1',
      },
    });

    const result = await service.applyExecution({ ...input, quantity: 4 });

    expect(result).toMatchObject({ applied: true, status: OrderStatus.FILLED });
    expect(updateArg(updateOrder)).toMatchObject({
      filledQuantity: 10,
      status: OrderStatus.FILLED,
    });
    expect(eventArg(createEvent).eventType).toBe('FILLED');
  });

  it('settles the execution in the same transaction', async () => {
    const { service, settle } = setup();

    await service.applyExecution(input);

    expect(settle).toHaveBeenCalledTimes(1);
    const [, settleInput] = settle.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
    ];
    expect(settleInput).toMatchObject({
      userId: 'u1',
      instrumentId: 'i1',
      side: OrderSide.BUY,
      quantity: 4,
      executionPrice: 100,
    });
  });

  // NFR-04: the whole point of the unique executionReference.
  it('ignores a duplicate execution reference and does not move the fill or settle', async () => {
    const logged = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const { service, updateOrder, settle } = setup({
      executionThrows: new UniqueViolation(),
    });

    const result = await service.applyExecution(input);

    expect(result).toEqual({ applied: false, reason: 'duplicate' });
    expect(updateOrder).not.toHaveBeenCalled();
    expect(settle).not.toHaveBeenCalled();
    logged.mockRestore();
  });

  it('does not settle against a cancelled order', async () => {
    const { service, settle } = setup({
      order: {
        id: 'o1',
        status: OrderStatus.CANCELLED,
        quantity: 10,
        filledQuantity: 2,
        side: OrderSide.BUY,
        userId: 'u1',
        instrumentId: 'i1',
      },
    });

    await service.applyExecution(input);

    expect(settle).not.toHaveBeenCalled();
  });

  it('settles only the clamped quantity, never more than remains', async () => {
    const { service, settle } = setup({
      order: {
        id: 'o1',
        status: OrderStatus.PARTIALLY_FILLED,
        quantity: 10,
        filledQuantity: 8,
        side: OrderSide.BUY,
        userId: 'u1',
        instrumentId: 'i1',
      },
    });

    await service.applyExecution({ ...input, quantity: 5 });

    const [, settleInput] = settle.mock.calls[0] as [
      unknown,
      { quantity: number },
    ];
    expect(settleInput.quantity).toBe(2);
  });

  it('refuses to execute against a cancelled order', async () => {
    const { service, createExecution } = setup({
      order: {
        id: 'o1',
        status: OrderStatus.CANCELLED,
        quantity: 10,
        filledQuantity: 2,
        side: OrderSide.BUY,
        userId: 'u1',
        instrumentId: 'i1',
      },
    });

    const result = await service.applyExecution(input);

    expect(result).toEqual({ applied: false, reason: 'not-open' });
    expect(createExecution).not.toHaveBeenCalled();
  });

  it('never fills more than the order asked for', async () => {
    const { service, updateOrder } = setup({
      order: {
        id: 'o1',
        status: OrderStatus.PARTIALLY_FILLED,
        quantity: 10,
        filledQuantity: 8,
        side: OrderSide.BUY,
        userId: 'u1',
        instrumentId: 'i1',
      },
    });

    // Asks for 5 but only 2 remain.
    const result = await service.applyExecution({ ...input, quantity: 5 });

    expect(result).toMatchObject({ applied: true, status: OrderStatus.FILLED });
    expect(updateArg(updateOrder).filledQuantity).toBe(10);
  });

  it('rethrows errors that are not unique violations', async () => {
    const { service } = setup({
      executionThrows: new Error('connection lost'),
    });
    await expect(service.applyExecution(input)).rejects.toThrow(
      'connection lost',
    );
  });
});
