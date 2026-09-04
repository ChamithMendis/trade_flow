import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { InstrumentsService } from './instruments.service';
import { MarketController } from './market.controller';
import { PriceEngineService } from './price-engine.service';

@Module({
  imports: [EventsModule],
  controllers: [MarketController],
  providers: [InstrumentsService, PriceEngineService],
  exports: [InstrumentsService],
})
export class MarketModule {}
