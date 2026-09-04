import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import type {
  AuthUser,
  OrderDetailDto,
  OrderDto,
} from '@tradeflow/shared-types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateOrderDto } from './dto/create-order.dto';
import { ListOrdersDto } from './dto/list-orders.dto';
import { OrdersService } from './orders.service';

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateOrderDto,
  ): Promise<OrderDto> {
    return this.orders.create(user.id, dto);
  }

  @Get()
  findAll(
    @CurrentUser() user: AuthUser,
    @Query() query: ListOrdersDto,
  ): Promise<OrderDto[]> {
    return this.orders.findAllForUser(user.id, query);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<OrderDetailDto> {
    return this.orders.findOneForUser(user.id, id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<OrderDto> {
    return this.orders.cancel(user.id, id);
  }
}
