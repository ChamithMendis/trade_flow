import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Length,
} from 'class-validator';
import {
  OrderSide,
  OrderType,
  type CreateOrderRequest,
} from '@tradeflow/shared-types';

export class CreateOrderDto implements CreateOrderRequest {
  @IsString()
  @Length(1, 16)
  @Transform(({ value }): unknown =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  symbol!: string;

  @IsEnum(OrderSide)
  side!: OrderSide;

  @IsEnum(OrderType)
  orderType!: OrderType;

  @IsInt({ message: 'quantity must be a whole number of shares' })
  @IsPositive()
  quantity!: number;

  /** Required for LIMIT, rejected for MARKET — enforced in OrdersService. */
  @IsOptional()
  @IsPositive()
  price?: number;
}
