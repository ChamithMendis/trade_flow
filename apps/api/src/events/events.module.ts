import { Module } from '@nestjs/common';
import { jwtModule } from '../auth/jwt.config';
import { EventsGateway } from './events.gateway';
import { EventsService } from './events.service';
import { OrderNotifier } from './order-notifier.service';

@Module({
  imports: [jwtModule],
  providers: [EventsGateway, EventsService, OrderNotifier],
  exports: [EventsService, OrderNotifier],
})
export class EventsModule {}
