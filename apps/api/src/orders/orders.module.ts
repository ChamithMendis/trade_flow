import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { ExchangeModule } from '../exchange/exchange.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [ExchangeModule, EventsModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
