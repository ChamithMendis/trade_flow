import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OrderSide, OrderStatus, OrderType } from '@tradeflow/shared-types';
import { ExchangeProducer } from '../exchange/exchange.producer';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersService } from './orders.service';
import type { CreateOrderDto } from './dto/create-order.dto';

interface Options {
  instrument?: {
    id: string;
    symbol: string;
    status: string;
    currentPrice: number;
  } | null;
  cash?: number;
  openOrders?: {
    side: OrderSide;
    instrumentId: string;
    quantity: number;
    filledQuantity: number;
    price: number | null;
    instrument: { currentPrice: number };
  }[];
  position?: { quantity: number } | null;
  order?: { id: string; status: OrderStatus; filledQuantity: number } | null;
}

function setup(options: Options = {}) {
  const {
    instrument = {
      id: 'i1',
      symbol: 'TFLX',
      status: 'ACTIVE',
      currentPrice: 100,
    },
    cash = 100_000,
    openOrders = [],
    position = null,
    order = null,
  } = options;

  const createOrder = jest.fn().mockResolvedValue({
    id: 'o1',
    instrumentId: 'i1',
    side: OrderSide.BUY,
    orderType: OrderType.MARKET,
    quantity: 10,
    filledQuantity: 0,
    price: null,
    status: OrderStatus.NEW,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    instrument: { symbol: 'TFLX', name: 'TradeFlex Holdings' },
  });
  const createEvent = jest.fn().mockResolvedValue({});
  const updateOrder = jest.fn().mockResolvedValue({
    id: 'o1',
    instrumentId: 'i1',
    side: OrderSide.BUY,
    orderType: OrderType.MARKET,
    quantity: 10,
    filledQuantity: 0,
    price: null,
    status: OrderStatus.CANCELLED,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    instrument: { symbol: 'TFLX', name: 'TradeFlex Holdings' },
  });

  const tx = {
    instrument: { findUnique: jest.fn().mockResolvedValue(instrument) },
    portfolio: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: 'p1', availableCash: cash }),
    },
    // cancel() locks the row with `SELECT ... FOR UPDATE`, which returns an array.
    $queryRaw: jest.fn().mockResolvedValue(order ? [order] : []),
    order: {
      findMany: jest.fn().mockResolvedValue(openOrders),
      create: createOrder,
      update: updateOrder,
    },
    position: { findUnique: jest.fn().mockResolvedValue(position) },
    orderEvent: { create: createEvent },
  };

  const prisma = {
    $transaction: (fn: (client: typeof tx) => unknown) => fn(tx),
  } as unknown as PrismaService;

  const enqueueOrder = jest.fn().mockResolvedValue(undefined);
  const exchange = { enqueueOrder } as unknown as ExchangeProducer;

  return {
    service: new OrdersService(prisma, exchange),
    createOrder,
    createEvent,
    enqueueOrder,
    tx,
  };
}

/** The `data` object a prisma `create({ data })` mock was called with. */
function createArg(mock: jest.Mock): Record<string, unknown> {
  const calls = mock.mock.calls as [{ data: Record<string, unknown> }][];
  return calls[0][0].data;
}

const buy = (over: Partial<CreateOrderDto> = {}): CreateOrderDto => ({
  symbol: 'TFLX',
  side: OrderSide.BUY,
  orderType: OrderType.MARKET,
  quantity: 10,
  ...over,
});

describe('OrdersService.create', () => {
  it('creates a NEW order and records a CREATED event', async () => {
    const { service, createOrder, createEvent } = setup();

    const result = await service.create('u1', buy());

    expect(result.status).toBe(OrderStatus.NEW);
    expect(createArg(createOrder).status).toBe(OrderStatus.NEW);
    expect(createArg(createEvent).eventType).toBe('CREATED');
  });

  it('queues the order for the exchange once created', async () => {
    const { service, enqueueOrder } = setup();
    const result = await service.create('u1', buy());
    expect(enqueueOrder).toHaveBeenCalledWith(result.id);
  });

  it('does not queue anything when validation fails', async () => {
    const { service, enqueueOrder } = setup({ cash: 10 });
    await expect(service.create('u1', buy())).rejects.toThrow();
    expect(enqueueOrder).not.toHaveBeenCalled();
  });

  it('rejects a buy the trader cannot afford', async () => {
    const { service } = setup({ cash: 500 });
    await expect(
      service.create('u1', buy({ quantity: 10 })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('counts open buy orders against buying power', async () => {
    // 100k cash, but 999 shares @ ~100 already committed by an open order.
    const { service } = setup({
      cash: 100_000,
      openOrders: [
        {
          side: OrderSide.BUY,
          instrumentId: 'i1',
          quantity: 999,
          filledQuantity: 0,
          price: null,
          instrument: { currentPrice: 100 },
        },
      ],
    });

    await expect(service.create('u1', buy({ quantity: 20 }))).rejects.toThrow(
      /Insufficient funds/,
    );
  });

  it('rejects selling more than the trader holds', async () => {
    const { service } = setup({ position: { quantity: 5 } });
    await expect(
      service.create('u1', buy({ side: OrderSide.SELL, quantity: 10 })),
    ).rejects.toThrow(/Insufficient holdings/);
  });

  it('counts open sell orders against sellable shares', async () => {
    const { service } = setup({
      position: { quantity: 10 },
      openOrders: [
        {
          side: OrderSide.SELL,
          instrumentId: 'i1',
          quantity: 8,
          filledQuantity: 0,
          price: null,
          instrument: { currentPrice: 100 },
        },
      ],
    });

    await expect(
      service.create('u1', buy({ side: OrderSide.SELL, quantity: 5 })),
    ).rejects.toThrow(/only 2 available/);
  });

  it('requires a price on LIMIT orders and forbids one on MARKET', async () => {
    const { service } = setup();
    await expect(
      service.create('u1', buy({ orderType: OrderType.LIMIT })),
    ).rejects.toThrow(/LIMIT order requires a price/);
    await expect(
      service.create('u1', buy({ orderType: OrderType.MARKET, price: 100 })),
    ).rejects.toThrow(/must not specify a price/);
  });

  it('refuses to trade a disabled instrument', async () => {
    const { service } = setup({
      instrument: {
        id: 'i1',
        symbol: 'TFLX',
        status: 'DISABLED',
        currentPrice: 100,
      },
    });
    await expect(service.create('u1', buy())).rejects.toThrow(/not tradable/);
  });

  it('404s on an unknown symbol', async () => {
    const { service } = setup({ instrument: null });
    await expect(service.create('u1', buy())).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('OrdersService.cancel', () => {
  it('cancels an order that is still open', async () => {
    const { service, createEvent } = setup({
      order: {
        id: 'o1',
        status: OrderStatus.PARTIALLY_FILLED,
        filledQuantity: 3,
      },
    });

    const result = await service.cancel('u1', 'o1');

    expect(result.status).toBe(OrderStatus.CANCELLED);
    expect(createArg(createEvent).eventType).toBe('CANCELLED');
  });

  it('refuses to cancel a filled order', async () => {
    const { service } = setup({
      order: { id: 'o1', status: OrderStatus.FILLED, filledQuantity: 10 },
    });
    await expect(service.cancel('u1', 'o1')).rejects.toThrow(
      /no longer be cancelled/,
    );
  });

  it('404s when the order belongs to someone else', async () => {
    // findFirst is scoped by userId, so another user's order simply isn't found.
    const { service } = setup({ order: null });
    await expect(service.cancel('u1', 'o1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
