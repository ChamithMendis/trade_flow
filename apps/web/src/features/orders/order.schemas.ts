import { z } from 'zod';
import { OrderSide, OrderType } from '@tradeflow/shared-types';

/**
 * Number inputs hand back strings, and '' means "not filled in". Registering
 * fields with this keeps the form values numeric, so the schema's input and
 * output types match — which is what React Hook Form's resolver requires.
 */
export const asNumber = (value: string): number | undefined =>
  value === '' ? undefined : Number(value);

export const orderTicketSchema = z
  .object({
    side: z.enum([OrderSide.BUY, OrderSide.SELL]),
    orderType: z.enum([OrderType.MARKET, OrderType.LIMIT]),
    quantity: z
      .number({ message: 'Quantity is required' })
      .int('Whole shares only')
      .positive('Must be at least 1'),
    price: z.number().positive('Must be greater than 0').optional(),
  })
  .refine((values) => values.orderType !== OrderType.LIMIT || values.price !== undefined, {
    message: 'A limit price is required',
    path: ['price'],
  });

export type OrderTicketValues = z.infer<typeof orderTicketSchema>;
