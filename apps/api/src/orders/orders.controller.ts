import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type {
  AuthUser,
  OrderDetailDto,
  OrderDto,
} from '@tradeflow/shared-types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateOrderDto } from './dto/create-order.dto';
import { ListOrdersDto } from './dto/list-orders.dto';
import { OrdersService } from './orders.service';

@ApiTags('orders')
@ApiBearerAuth('bearer')
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  /**
   * Validates buying power (or holdings for a sell), persists the order as NEW
   * and queues it for the exchange simulator. Fills arrive over WebSockets.
   */
  @ApiOperation({ summary: 'Place an order' })
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateOrderDto,
  ): Promise<OrderDto> {
    return this.orders.create(user.id, dto);
  }

  /** Only the caller's own orders, newest first. */
  @ApiOperation({ summary: 'List your orders' })
  @Get()
  findAll(
    @CurrentUser() user: AuthUser,
    @Query() query: ListOrdersDto,
  ): Promise<OrderDto[]> {
    return this.orders.findAllForUser(user.id, query);
  }

  /** Includes the execution and event history. Another trader's order 404s. */
  @ApiOperation({ summary: 'Get one order with its history' })
  @Get(':id')
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<OrderDetailDto> {
    return this.orders.findOneForUser(user.id, id);
  }

  /** Allowed only while the order is NEW, PROCESSING or PARTIALLY_FILLED. */
  @ApiOperation({ summary: 'Cancel an order' })
  @Post(':id/cancel')
  @HttpCode(200)
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<OrderDto> {
    return this.orders.cancel(user.id, id);
  }
}
