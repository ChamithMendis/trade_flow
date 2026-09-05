/**
 * The eight critical scenarios from §14 of the project specification, run
 * against a real PostgreSQL and Redis.
 *
 * Scenarios that would otherwise depend on the simulator's randomness drive
 * `ExecutionService` directly, so they assert the guarantee rather than winning
 * a race. Those orders are created straight through Prisma, which means no job
 * is queued and the background worker cannot interfere.
 */
import '../src/config/load-env';

// Quiet the background engines so tests own the data they create.
process.env.MARKET_TICK_MS = '0';
process.env.EXCHANGE_REJECT_RATE = '0';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { OrderStatus, WsEvent, type OrderDto } from '@tradeflow/shared-types';
import request from 'supertest';
import type { App } from 'supertest/types';
import { io, type Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { ExecutionService } from '../src/exchange/execution.service';
import { PrismaService } from '../src/prisma/prisma.service';

const PASSWORD = 'password123';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('Critical scenarios (spec §14)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let executions: ExecutionService;
  let baseUrl: string;

  let alice: { id: string; token: string };
  let bob: { id: string; token: string };
  let instrumentId: string;

  const stamp = Date.now();
  const emails = [
    `alice-e2e-${stamp}@example.com`,
    `bob-e2e-${stamp}@example.com`,
  ];

  async function register(email: string) {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name: 'Test', email, password: PASSWORD })
      .expect(201);
    const body = res.body as { accessToken: string; user: { id: string } };
    return { id: body.user.id, token: body.accessToken };
  }

  /** Creates an order without queueing it, so the worker leaves it alone. */
  async function seedOrder(
    userId: string,
    overrides: Partial<{
      side: 'BUY' | 'SELL';
      quantity: number;
      status: OrderStatus;
    }> = {},
  ) {
    return prisma.order.create({
      data: {
        userId,
        instrumentId,
        side: overrides.side ?? 'BUY',
        orderType: 'MARKET',
        quantity: overrides.quantity ?? 10,
        status: overrides.status ?? OrderStatus.PROCESSING,
      },
    });
  }

  const cashOf = async (userId: string) =>
    Number(
      (await prisma.portfolio.findUniqueOrThrow({ where: { userId } }))
        .availableCash,
    );

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    await app.listen(0);
    baseUrl = await app
      .getUrl()
      .then((url) => url.replace('[::1]', 'localhost'));

    prisma = app.get(PrismaService);
    executions = app.get(ExecutionService);

    alice = await register(emails[0]);
    bob = await register(emails[1]);
    instrumentId = (
      await prisma.instrument.findUniqueOrThrow({ where: { symbol: 'TFLX' } })
    ).id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  });

  it('1. a user cannot buy shares without sufficient virtual cash', async () => {
    const res = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${alice.token}`)
      .send({
        symbol: 'APEX',
        side: 'BUY',
        orderType: 'LIMIT',
        quantity: 100_000,
        price: 250,
      })
      .expect(400);

    expect(String((res.body as { message: string }).message)).toMatch(
      /Insufficient funds/,
    );
    expect(await cashOf(alice.id)).toBe(100_000);
  });

  it('2. a user cannot sell more shares than they own', async () => {
    const res = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ symbol: 'TFLX', side: 'SELL', orderType: 'MARKET', quantity: 1 })
      .expect(400);

    expect(String((res.body as { message: string }).message)).toMatch(
      /Insufficient holdings/,
    );
  });

  it('3. an order can move through multiple partial fills', async () => {
    const order = await seedOrder(alice.id, { quantity: 10 });

    const first = await executions.applyExecution({
      orderId: order.id,
      quantity: 3,
      executionPrice: 100,
      executionReference: `${order.id}:0`,
    });
    const second = await executions.applyExecution({
      orderId: order.id,
      quantity: 4,
      executionPrice: 100,
      executionReference: `${order.id}:1`,
    });
    const third = await executions.applyExecution({
      orderId: order.id,
      quantity: 3,
      executionPrice: 100,
      executionReference: `${order.id}:2`,
    });

    expect(first).toMatchObject({
      status: OrderStatus.PARTIALLY_FILLED,
      filledQuantity: 3,
    });
    expect(second).toMatchObject({
      status: OrderStatus.PARTIALLY_FILLED,
      filledQuantity: 7,
    });
    expect(third).toMatchObject({
      status: OrderStatus.FILLED,
      filledQuantity: 10,
    });

    const events = await prisma.orderEvent.findMany({
      where: { orderId: order.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(events.map((e) => e.eventType)).toEqual([
      'PARTIALLY_FILLED',
      'PARTIALLY_FILLED',
      'FILLED',
    ]);
  });

  it('4. a fully filled order cannot be cancelled', async () => {
    const order = await seedOrder(alice.id, { quantity: 5 });
    await executions.applyExecution({
      orderId: order.id,
      quantity: 5,
      executionPrice: 100,
      executionReference: `${order.id}:0`,
    });

    const res = await request(app.getHttpServer())
      .post(`/orders/${order.id}/cancel`)
      .set('Authorization', `Bearer ${alice.token}`)
      .expect(400);

    expect(String((res.body as { message: string }).message)).toMatch(
      /no longer be cancelled/,
    );
    const after = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(after.status).toBe(OrderStatus.FILLED);
  });

  it('5. a cancelled order cannot receive new execution processing', async () => {
    const order = await seedOrder(alice.id, { quantity: 10 });
    await request(app.getHttpServer())
      .post(`/orders/${order.id}/cancel`)
      .set('Authorization', `Bearer ${alice.token}`)
      .expect(200);

    const cashBefore = await cashOf(alice.id);
    const result = await executions.applyExecution({
      orderId: order.id,
      quantity: 5,
      executionPrice: 100,
      executionReference: `${order.id}:0`,
    });

    expect(result).toEqual({ applied: false, reason: 'not-open' });
    const after = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(after.status).toBe(OrderStatus.CANCELLED);
    expect(after.filledQuantity).toBe(0);
    expect(await prisma.execution.count({ where: { orderId: order.id } })).toBe(
      0,
    );
    expect(await cashOf(alice.id)).toBe(cashBefore);
  });

  it('6. the same execution processed twice does not change the portfolio twice', async () => {
    const order = await seedOrder(alice.id, { quantity: 10 });
    const reference = `${order.id}:0`;
    const input = {
      orderId: order.id,
      quantity: 4,
      executionPrice: 100,
      executionReference: reference,
    };

    const cashBefore = await cashOf(alice.id);
    const first = await executions.applyExecution(input);
    expect(first.applied).toBe(true);

    const cashAfterFirst = await cashOf(alice.id);
    const sharesAfterFirst = (
      await prisma.position.findFirstOrThrow({
        where: { instrumentId, portfolio: { userId: alice.id } },
      })
    ).quantity;
    expect(cashAfterFirst).toBe(cashBefore - 400);

    // Replay the identical reference.
    const replay = await executions.applyExecution(input);

    expect(replay).toEqual({ applied: false, reason: 'duplicate' });
    expect(await cashOf(alice.id)).toBe(cashAfterFirst);
    expect(
      (
        await prisma.position.findFirstOrThrow({
          where: { instrumentId, portfolio: { userId: alice.id } },
        })
      ).quantity,
    ).toBe(sharesAfterFirst);
    expect(
      (await prisma.order.findUniqueOrThrow({ where: { id: order.id } }))
        .filledQuantity,
    ).toBe(4);
    expect(
      await prisma.execution.count({
        where: { executionReference: reference },
      }),
    ).toBe(1);
  });

  it("7. a user cannot access another user's orders or portfolio", async () => {
    const aliceOrder = await seedOrder(alice.id);
    const server: App = app.getHttpServer();

    await request(server)
      .get(`/orders/${aliceOrder.id}`)
      .set('Authorization', `Bearer ${bob.token}`)
      .expect(404);

    await request(server)
      .post(`/orders/${aliceOrder.id}/cancel`)
      .set('Authorization', `Bearer ${bob.token}`)
      .expect(404);

    const list = await request(server)
      .get('/orders')
      .set('Authorization', `Bearer ${bob.token}`)
      .expect(200);
    expect(list.body).toEqual([]);

    const portfolio = await request(server)
      .get('/portfolio')
      .set('Authorization', `Bearer ${bob.token}`)
      .expect(200);
    expect((portfolio.body as { availableCash: number }).availableCash).toBe(
      100_000,
    );
    expect((portfolio.body as { positions: unknown[] }).positions).toEqual([]);

    await request(server).get('/portfolio').expect(401);
    await request(server).get('/orders').expect(401);
  });

  describe('8. WebSocket clients receive only their own events', () => {
    const sockets: Socket[] = [];

    afterAll(() => {
      for (const socket of sockets) socket.close();
    });

    function connect(token?: string) {
      return new Promise<{
        socket: Socket;
        connected: boolean;
        received: OrderDto[];
      }>((resolve) => {
        const socket = io(baseUrl, {
          transports: ['websocket'],
          reconnection: false,
          auth: token ? { token } : {},
        });
        sockets.push(socket);
        const received: OrderDto[] = [];
        socket.on(WsEvent.ORDER_CREATED, (order: OrderDto) =>
          received.push(order),
        );
        socket.on('connect', () =>
          resolve({ socket, connected: true, received }),
        );
        socket.on('connect_error', () =>
          resolve({ socket, connected: false, received }),
        );
      });
    }

    it('refuses a handshake without a valid token', async () => {
      expect((await connect()).connected).toBe(false);
      expect((await connect('not-a-jwt')).connected).toBe(false);
    });

    it('delivers an order event to its owner and to nobody else', async () => {
      const aliceSocket = await connect(alice.token);
      const bobSocket = await connect(bob.token);
      expect(aliceSocket.connected).toBe(true);
      expect(bobSocket.connected).toBe(true);

      await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${alice.token}`)
        .send({ symbol: 'TFLX', side: 'BUY', orderType: 'MARKET', quantity: 1 })
        .expect(201);

      await sleep(1000);

      expect(aliceSocket.received.length).toBeGreaterThan(0);
      expect(aliceSocket.received[0].symbol).toBe('TFLX');
      expect(bobSocket.received).toEqual([]);
    });
  });
});
