import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type {
  AuthUser,
  PortfolioSummaryDto,
  PositionDto,
  TransactionDto,
} from '@tradeflow/shared-types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PortfolioService } from './portfolio.service';

@ApiTags('portfolio')
@ApiBearerAuth('bearer')
@Controller('portfolio')
export class PortfolioController {
  constructor(private readonly portfolio: PortfolioService) {}

  /**
   * Cash, holdings and unrealized P/L. Market value is computed from the
   * instrument's live price at request time, never stored.
   */
  @ApiOperation({ summary: 'Portfolio summary' })
  @Get()
  getSummary(@CurrentUser() user: AuthUser): Promise<PortfolioSummaryDto> {
    return this.portfolio.getSummary(user.id);
  }

  @ApiOperation({ summary: 'Open positions' })
  @Get('positions')
  getPositions(@CurrentUser() user: AuthUser): Promise<PositionDto[]> {
    return this.portfolio.getPositions(user.id);
  }

  /** Every execution across the caller's orders, newest first (max 200). */
  @ApiOperation({ summary: 'Execution history' })
  @Get('transactions')
  getTransactions(@CurrentUser() user: AuthUser): Promise<TransactionDto[]> {
    return this.portfolio.getTransactions(user.id);
  }
}
