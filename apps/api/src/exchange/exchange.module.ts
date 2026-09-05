import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { PortfolioModule } from '../portfolio/portfolio.module';
import { EXCHANGE_QUEUE } from './exchange.constants';
import { ExchangeProcessor } from './exchange.processor';
import { ExchangeProducer } from './exchange.producer';
import { ExecutionService } from './execution.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: EXCHANGE_QUEUE }),
    EventsModule,
    PortfolioModule,
  ],
  providers: [ExchangeProcessor, ExchangeProducer, ExecutionService],
  exports: [ExchangeProducer, ExecutionService],
})
export class ExchangeModule {}
