import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InstrumentStatus,
  OPEN_ORDER_STATUSES,
  OrderEventType,
  OrderSide,
  OrderStatus,
  OrderType,
  isOpenOrderStatus,
  type OrderDetailDto,
  type OrderDto,
} from '@tradeflow/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { ListOrdersDto } from './dto/list-orders.dto';
import { toOrderDetailDto, toOrderDto } from './order.mapper';

/** Money is Decimal(18,4) in the database; round before comparing floats. */
function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

const instrumentSelect = {
  instrument: { select: { symbol: true, name: true } },
};

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateOrderDto): Promise<OrderDto> {
    this.assertPriceMatchesType(dto);

    // One interactive transaction so two concurrent submits cannot both pass
    // the buying-power check.
    return this.prisma.$transaction(async (tx) => {
      const instrument = await tx.instrument.findUnique({
        where: { symbol: dto.symbol },
      });
      if (!instrument) {
        throw new NotFoundException(`Instrument '${dto.symbol}' not found`);
      }
      // Prisma generates its own enum types, so widen to the shared enum.
      if ((instrument.status as InstrumentStatus) !== InstrumentStatus.ACTIVE) {
        throw new BadRequestException(
          `Instrument '${dto.symbol}' is not tradable`,
        );
      }

      const portfolio = await tx.portfolio.findUnique({ where: { userId } });
      if (!portfolio) {
        throw new NotFoundException('Portfolio not found');
      }

      // A MARKET order has no price of its own, so the live price is the estimate.
      const referencePrice = dto.price ?? Number(instrument.currentPrice);

      const openOrders = await tx.order.findMany({
        where: { userId, status: { in: [...OPEN_ORDER_STATUSES] } },
        include: { instrument: { select: { currentPrice: true } } },
      });

      if (dto.side === OrderSide.BUY) {
        // Cash already spoken for by orders that haven't finished executing.
        const committedCash = openOrders
          .filter((order) => (order.side as OrderSide) === OrderSide.BUY)
          .reduce((total, order) => {
            const remaining = order.quantity - order.filledQuantity;
            const basis = order.price ?? order.instrument.currentPrice;
            return total + remaining * Number(basis);
          }, 0);

        const buyingPower = round4(
          Number(portfolio.availableCash) - committedCash,
        );
        const cost = round4(dto.quantity * referencePrice);

        if (cost > buyingPower) {
          throw new BadRequestException(
            `Insufficient funds: order costs ${cost.toFixed(2)} but buying power is ${buyingPower.toFixed(2)}`,
          );
        }
      } else {
        const position = await tx.position.findUnique({
          where: {
            portfolioId_instrumentId: {
              portfolioId: portfolio.id,
              instrumentId: instrument.id,
            },
          },
        });

        // Shares already promised to other open sell orders.
        const committedShares = openOrders
          .filter(
            (order) =>
              (order.side as OrderSide) === OrderSide.SELL &&
              order.instrumentId === instrument.id,
          )
          .reduce(
            (total, order) => total + (order.quantity - order.filledQuantity),
            0,
          );

        const sellable = (position?.quantity ?? 0) - committedShares;
        if (dto.quantity > sellable) {
          throw new BadRequestException(
            `Insufficient holdings: trying to sell ${dto.quantity} ${dto.symbol} but only ${sellable} available`,
          );
        }
      }

      const order = await tx.order.create({
        data: {
          userId,
          instrumentId: instrument.id,
          side: dto.side,
          orderType: dto.orderType,
          quantity: dto.quantity,
          price: dto.price ?? null,
          status: OrderStatus.NEW,
        },
        include: instrumentSelect,
      });

      await tx.orderEvent.create({
        data: {
          orderId: order.id,
          eventType: OrderEventType.CREATED,
          payload: {
            side: dto.side,
            orderType: dto.orderType,
            quantity: dto.quantity,
            price: dto.price ?? null,
            referencePrice,
          },
        },
      });

      return toOrderDto(order);
    });
  }

  async findAllForUser(
    userId: string,
    query: ListOrdersDto,
  ): Promise<OrderDto[]> {
    const orders = await this.prisma.order.findMany({
      where: { userId, ...(query.status ? { status: query.status } : {}) },
      include: instrumentSelect,
      orderBy: { createdAt: 'desc' },
    });
    return orders.map(toOrderDto);
  }

  async findOneForUser(
    userId: string,
    orderId: string,
  ): Promise<OrderDetailDto> {
    const order = await this.prisma.order.findFirst({
      // Scoped by userId so one trader can never read another's order.
      where: { id: orderId, userId },
      include: {
        ...instrumentSelect,
        executions: { orderBy: { executionTime: 'asc' } },
        events: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!order) {
      throw new NotFoundException(`Order '${orderId}' not found`);
    }
    return toOrderDetailDto(order);
  }

  async cancel(userId: string, orderId: string): Promise<OrderDto> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.order.findFirst({
        where: { id: orderId, userId },
      });
      if (!existing) {
        throw new NotFoundException(`Order '${orderId}' not found`);
      }
      if (!isOpenOrderStatus(existing.status as OrderStatus)) {
        throw new BadRequestException(
          `Order is ${existing.status} and can no longer be cancelled`,
        );
      }

      const order = await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.CANCELLED },
        include: instrumentSelect,
      });

      await tx.orderEvent.create({
        data: {
          orderId,
          eventType: OrderEventType.CANCELLED,
          payload: {
            previousStatus: existing.status,
            filledQuantity: existing.filledQuantity,
          },
        },
      });

      return toOrderDto(order);
    });
  }

  private assertPriceMatchesType(dto: CreateOrderDto): void {
    if (dto.orderType === OrderType.LIMIT && dto.price === undefined) {
      throw new BadRequestException('A LIMIT order requires a price');
    }
    if (dto.orderType === OrderType.MARKET && dto.price !== undefined) {
      throw new BadRequestException('A MARKET order must not specify a price');
    }
  }
}
