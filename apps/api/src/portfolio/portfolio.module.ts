import { Module } from '@nestjs/common';
import { PortfolioController } from './portfolio.controller';
import { PortfolioService } from './portfolio.service';
import { SettlementService } from './settlement.service';

/**
 * Deliberately imports nothing from Exchange: ExchangeModule imports *this* one
 * to settle executions, so a dependency back the other way would be circular.
 */
@Module({
  controllers: [PortfolioController],
  providers: [PortfolioService, SettlementService],
  exports: [PortfolioService, SettlementService],
})
export class PortfolioModule {}
