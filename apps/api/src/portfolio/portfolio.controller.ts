import { Controller, Get } from '@nestjs/common';
import type {
  AuthUser,
  PortfolioSummaryDto,
  PositionDto,
  TransactionDto,
} from '@tradeflow/shared-types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PortfolioService } from './portfolio.service';

@Controller('portfolio')
export class PortfolioController {
  constructor(private readonly portfolio: PortfolioService) {}

  @Get()
  getSummary(@CurrentUser() user: AuthUser): Promise<PortfolioSummaryDto> {
    return this.portfolio.getSummary(user.id);
  }

  @Get('positions')
  getPositions(@CurrentUser() user: AuthUser): Promise<PositionDto[]> {
    return this.portfolio.getPositions(user.id);
  }

  @Get('transactions')
  getTransactions(@CurrentUser() user: AuthUser): Promise<TransactionDto[]> {
    return this.portfolio.getTransactions(user.id);
  }
}
