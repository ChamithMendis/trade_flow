import { IsEnum, IsOptional } from 'class-validator';
import { OrderStatus } from '@tradeflow/shared-types';

export class ListOrdersDto {
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;
}
