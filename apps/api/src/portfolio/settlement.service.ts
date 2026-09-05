import { Injectable, Logger } from '@nestjs/common';
import { OrderSide } from '@tradeflow/shared-types';
import type { Prisma } from '../generated/prisma/client';

/** Money is Decimal(18,4) in the database; round after every step. */
function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

interface LockedPortfolioRow {
  id: string;
  availableCash: string | number;
}

interface LockedPositionRow {
  id: string;
  quantity: number;
  averagePrice: string | number;
}

export interface SettleInput {
  userId: string;
  instrumentId: string;
  side: OrderSide;
  quantity: number;
  executionPrice: number;
}

/**
 * Moves cash and positions for one execution.
 *
 * Takes the caller's transaction client rather than opening its own: it runs
 * inside `ExecutionService.applyExecution`, in the same transaction as the
 * `executions` insert. That is what makes the unique `executionReference`
 * protect the portfolio too — a replayed execution fails the insert, the whole
 * transaction rolls back, and cash never moves twice (NFR-04).
 */
@Injectable()
export class SettlementService {
  private readonly logger = new Logger(SettlementService.name);

  async settle(
    tx: Prisma.TransactionClient,
    input: SettleInput,
  ): Promise<void> {
    // Lock the portfolio so two executions for the same trader serialise
    // instead of both reading the same starting cash.
    const [portfolio] = await tx.$queryRaw<LockedPortfolioRow[]>`
      SELECT id, "availableCash"
      FROM portfolios
      WHERE "userId" = ${input.userId}
      FOR UPDATE
    `;
    if (!portfolio) {
      this.logger.error(
        `No portfolio for user ${input.userId}; execution not settled`,
      );
      return;
    }

    const proceeds = round4(input.quantity * input.executionPrice);
    const cash = Number(portfolio.availableCash);

    if (input.side === OrderSide.BUY) {
      await tx.portfolio.update({
        where: { id: portfolio.id },
        data: { availableCash: round4(cash - proceeds) },
      });
      await this.addShares(tx, portfolio.id, input);
    } else {
      await tx.portfolio.update({
        where: { id: portfolio.id },
        data: { availableCash: round4(cash + proceeds) },
      });
      await this.removeShares(tx, portfolio.id, input);
    }
  }

  /**
   * Buying rolls the new shares into a weighted average cost:
   * `(oldQty × oldAvg + newQty × price) / (oldQty + newQty)`.
   */
  private async addShares(
    tx: Prisma.TransactionClient,
    portfolioId: string,
    input: SettleInput,
  ): Promise<void> {
    const existing = await tx.position.findUnique({
      where: {
        portfolioId_instrumentId: {
          portfolioId,
          instrumentId: input.instrumentId,
        },
      },
    });

    if (!existing) {
      await tx.position.create({
        data: {
          portfolioId,
          instrumentId: input.instrumentId,
          quantity: input.quantity,
          averagePrice: round4(input.executionPrice),
        },
      });
      return;
    }

    const oldQuantity = existing.quantity;
    const oldAverage = Number(existing.averagePrice);
    const quantity = oldQuantity + input.quantity;
    const averagePrice = round4(
      (oldQuantity * oldAverage + input.quantity * input.executionPrice) /
        quantity,
    );

    await tx.position.update({
      where: { id: existing.id },
      data: { quantity, averagePrice },
    });
  }

  /**
   * Selling leaves the average cost alone — it is the cost of what remains —
   * and drops the row once the position is flat. Realized P/L is a V2 item per
   * the spec, so nothing records it here.
   */
  private async removeShares(
    tx: Prisma.TransactionClient,
    portfolioId: string,
    input: SettleInput,
  ): Promise<void> {
    // Locked for the same reason as the portfolio: concurrent sells on one
    // instrument must not both read the same starting quantity.
    const [position] = await tx.$queryRaw<LockedPositionRow[]>`
      SELECT id, quantity, "averagePrice"
      FROM positions
      WHERE "portfolioId" = ${portfolioId} AND "instrumentId" = ${input.instrumentId}
      FOR UPDATE
    `;
    if (!position) {
      // Order validation should have prevented this.
      this.logger.error(
        `Sell settled with no position: user ${input.userId}, instrument ${input.instrumentId}`,
      );
      return;
    }

    const quantity = position.quantity - input.quantity;
    if (quantity <= 0) {
      await tx.position.delete({ where: { id: position.id } });
      return;
    }
    await tx.position.update({
      where: { id: position.id },
      data: { quantity },
    });
  }
}
