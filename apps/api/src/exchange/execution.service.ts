import { Injectable, Logger } from '@nestjs/common';
import {
  OrderEventType,
  OrderStatus,
  isOpenOrderStatus,
  type OrderSide,
} from '@tradeflow/shared-types';
import { SettlementService } from '../portfolio/settlement.service';
import { PrismaService } from '../prisma/prisma.service';

/** Prisma's unique-constraint violation. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}

export interface ApplyExecutionInput {
  orderId: string;
  quantity: number;
  executionPrice: number;
  /** Unique per (order, sequence) — the idempotency key. */
  executionReference: string;
}

/** Shape of the locked row read back by `SELECT ... FOR UPDATE`. */
interface LockedOrderRow {
  id: string;
  status: string;
  quantity: number;
  filledQuantity: number;
  side: string;
  userId: string;
  instrumentId: string;
}

export type ApplyExecutionResult =
  | {
      applied: true;
      status: OrderStatus;
      filledQuantity: number;
      quantity: number;
      side: OrderSide;
      userId: string;
      instrumentId: string;
    }
  | { applied: false; reason: 'duplicate' | 'not-open' };

/**
 * Applies a single execution to an order, exactly once.
 *
 * `executions.executionReference` carries a unique constraint, so a replayed or
 * duplicated event loses the insert race and is reported as `duplicate` instead
 * of moving `filledQuantity` a second time (NFR-04). Everything below happens in
 * one transaction, so the execution row, the order's new fill state **and the
 * portfolio settlement** commit together or not at all — which is what extends
 * the idempotency guarantee to cash and positions.
 */
@Injectable()
export class ExecutionService {
  private readonly logger = new Logger(ExecutionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settlement: SettlementService,
  ) {}

  async applyExecution(
    input: ApplyExecutionInput,
  ): Promise<ApplyExecutionResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Lock the row. A plain read under READ COMMITTED would let a cancel
        // commit between the status check and the update, and this update would
        // silently overwrite it — the order would come back to life as FILLED.
        const [order] = await tx.$queryRaw<LockedOrderRow[]>`
          SELECT id, status, quantity, "filledQuantity", side, "userId", "instrumentId"
          FROM orders
          WHERE id = ${input.orderId}
          FOR UPDATE
        `;
        if (!order || !isOpenOrderStatus(order.status as OrderStatus)) {
          // Cancelled or already finished — a late execution must not revive it.
          return { applied: false, reason: 'not-open' as const };
        }

        // Never fill more than the order asked for.
        const remaining = order.quantity - order.filledQuantity;
        const quantity = Math.min(input.quantity, remaining);
        if (quantity <= 0) {
          return { applied: false, reason: 'not-open' as const };
        }

        await tx.execution.create({
          data: {
            orderId: order.id,
            quantity,
            executionPrice: input.executionPrice,
            executionReference: input.executionReference,
          },
        });

        const filledQuantity = order.filledQuantity + quantity;
        const status =
          filledQuantity >= order.quantity
            ? OrderStatus.FILLED
            : OrderStatus.PARTIALLY_FILLED;

        await tx.order.update({
          where: { id: order.id },
          data: { filledQuantity, status },
        });

        await tx.orderEvent.create({
          data: {
            orderId: order.id,
            eventType:
              status === OrderStatus.FILLED
                ? OrderEventType.FILLED
                : OrderEventType.PARTIALLY_FILLED,
            payload: {
              quantity,
              executionPrice: input.executionPrice,
              executionReference: input.executionReference,
              filledQuantity,
              remaining: order.quantity - filledQuantity,
            },
          },
        });

        // Same transaction as the execution insert above, so a replayed
        // execution rolls the cash and position changes back with it.
        await this.settlement.settle(tx, {
          userId: order.userId,
          instrumentId: order.instrumentId,
          side: order.side as OrderSide,
          quantity,
          executionPrice: input.executionPrice,
        });

        return {
          applied: true as const,
          status,
          filledQuantity,
          quantity: order.quantity,
          side: order.side as OrderSide,
          userId: order.userId,
          instrumentId: order.instrumentId,
        };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        this.logger.warn(
          `Duplicate execution ignored: ${input.executionReference}`,
        );
        return { applied: false, reason: 'duplicate' };
      }
      throw error;
    }
  }

  /** How many executions an order already has — the next sequence number. */
  countExecutions(orderId: string): Promise<number> {
    return this.prisma.execution.count({ where: { orderId } });
  }
}
