import { Injectable, NotFoundException } from '@nestjs/common';
import {
  OrderSide,
  type PortfolioSummaryDto,
  type PositionDto,
  type TransactionDto,
} from '@tradeflow/shared-types';
import { PrismaService } from '../prisma/prisma.service';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

@Injectable()
export class PortfolioService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(userId: string): Promise<PortfolioSummaryDto> {
    const portfolio = await this.prisma.portfolio.findUnique({
      where: { userId },
      include: { positions: { include: { instrument: true } } },
    });
    if (!portfolio) {
      throw new NotFoundException('Portfolio not found');
    }

    const positions = portfolio.positions
      .map((position) => this.toPositionDto(position))
      .sort((a, b) => b.marketValue - a.marketValue);

    const holdingsValue = round2(
      positions.reduce((total, p) => total + p.marketValue, 0),
    );
    const costBasis = round2(
      positions.reduce((total, p) => total + p.costBasis, 0),
    );
    const availableCash = round2(Number(portfolio.availableCash));
    const unrealizedPnL = round2(holdingsValue - costBasis);

    return {
      availableCash,
      positions,
      holdingsValue,
      costBasis,
      totalValue: round2(availableCash + holdingsValue),
      unrealizedPnL,
      unrealizedPnLPercent:
        costBasis === 0 ? 0 : round2((unrealizedPnL / costBasis) * 100),
    };
  }

  async getPositions(userId: string): Promise<PositionDto[]> {
    const { positions } = await this.getSummary(userId);
    return positions;
  }

  /** Every execution across the trader's orders, newest first. */
  async getTransactions(userId: string): Promise<TransactionDto[]> {
    const executions = await this.prisma.execution.findMany({
      where: { order: { userId } },
      include: {
        order: { include: { instrument: { select: { symbol: true } } } },
      },
      orderBy: { executionTime: 'desc' },
      take: 200,
    });

    return executions.map((execution) => {
      const executionPrice = Number(execution.executionPrice);
      return {
        id: execution.id,
        orderId: execution.orderId,
        symbol: execution.order.instrument.symbol,
        side: execution.order.side as OrderSide,
        quantity: execution.quantity,
        executionPrice,
        value: round2(execution.quantity * executionPrice),
        executionTime: execution.executionTime.toISOString(),
      };
    });
  }

  /**
   * Market value and P/L are computed on read from the instrument's live price,
   * never stored — otherwise every price tick would have to rewrite every
   * position row.
   */
  private toPositionDto(position: {
    instrumentId: string;
    quantity: number;
    averagePrice: unknown;
    updatedAt: Date;
    instrument: { symbol: string; name: string; currentPrice: unknown };
  }): PositionDto {
    const averagePrice = Number(position.averagePrice);
    const currentPrice = Number(position.instrument.currentPrice);
    const costBasis = round2(position.quantity * averagePrice);
    const marketValue = round2(position.quantity * currentPrice);
    const unrealizedPnL = round2(marketValue - costBasis);

    return {
      instrumentId: position.instrumentId,
      symbol: position.instrument.symbol,
      instrumentName: position.instrument.name,
      quantity: position.quantity,
      averagePrice,
      currentPrice,
      costBasis,
      marketValue,
      unrealizedPnL,
      unrealizedPnLPercent:
        costBasis === 0 ? 0 : round2((unrealizedPnL / costBasis) * 100),
      updatedAt: position.updatedAt.toISOString(),
    };
  }
}
