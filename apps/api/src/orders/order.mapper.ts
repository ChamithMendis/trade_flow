import {
  OrderEventType,
  OrderSide,
  OrderStatus,
  OrderType,
  type ExecutionDto,
  type OrderDetailDto,
  type OrderDto,
  type OrderEventDto,
} from '@tradeflow/shared-types';
import type {
  Execution,
  Instrument,
  Order,
  OrderEvent,
} from '../generated/prisma/client';

type OrderWithInstrument = Order & {
  instrument: Pick<Instrument, 'symbol' | 'name'>;
};

export function toOrderDto(order: OrderWithInstrument): OrderDto {
  return {
    id: order.id,
    instrumentId: order.instrumentId,
    symbol: order.instrument.symbol,
    instrumentName: order.instrument.name,
    side: order.side as OrderSide,
    orderType: order.orderType as OrderType,
    quantity: order.quantity,
    filledQuantity: order.filledQuantity,
    price: order.price === null ? null : Number(order.price),
    status: order.status as OrderStatus,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}

export function toExecutionDto(execution: Execution): ExecutionDto {
  return {
    id: execution.id,
    quantity: execution.quantity,
    executionPrice: Number(execution.executionPrice),
    executionReference: execution.executionReference,
    executionTime: execution.executionTime.toISOString(),
  };
}

export function toOrderEventDto(event: OrderEvent): OrderEventDto {
  return {
    id: event.id,
    eventType: event.eventType as OrderEventType,
    payload: event.payload,
    createdAt: event.createdAt.toISOString(),
  };
}

export function toOrderDetailDto(
  order: OrderWithInstrument & {
    executions: Execution[];
    events: OrderEvent[];
  },
): OrderDetailDto {
  return {
    ...toOrderDto(order),
    executions: order.executions.map(toExecutionDto),
    events: order.events.map(toOrderEventDto),
  };
}
