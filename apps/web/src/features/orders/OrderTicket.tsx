import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { OrderSide, OrderType, type InstrumentDto } from '@tradeflow/shared-types';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { apiErrorMessage } from '@/lib/api';
import { useCreateOrder } from './orders.api';
import { money } from './order.format';
import { asNumber, orderTicketSchema, type OrderTicketValues } from './order.schemas';

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  activeClass = 'bg-slate-900 text-white',
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  activeClass?: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-md bg-slate-100 p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`rounded px-3 py-1.5 text-sm font-medium transition ${
            value === option.value ? activeClass : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function OrderTicket({ instrument }: { instrument: InstrumentDto }) {
  const createOrder = useCreateOrder();
  const [placed, setPlaced] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<OrderTicketValues>({
    resolver: zodResolver(orderTicketSchema),
    defaultValues: { side: OrderSide.BUY, orderType: OrderType.MARKET },
  });

  const side = watch('side');
  const orderType = watch('orderType');
  const quantity = watch('quantity');
  const price = watch('price');

  // Reset the ticket when the trader picks a different instrument.
  useEffect(() => {
    reset({ side: OrderSide.BUY, orderType: OrderType.MARKET });
    setPlaced(null);
    createOrder.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instrument.symbol, reset]);

  const basis = orderType === OrderType.LIMIT ? price : instrument.currentPrice;
  const estimate = Number(quantity) > 0 && basis ? Number(quantity) * Number(basis) : null;

  const onSubmit = handleSubmit((values) => {
    setPlaced(null);
    createOrder.mutate(
      {
        symbol: instrument.symbol,
        side: values.side,
        orderType: values.orderType,
        quantity: values.quantity,
        ...(values.orderType === OrderType.LIMIT ? { price: values.price } : {}),
      },
      {
        onSuccess: (order) => {
          setPlaced(`${order.side} ${order.quantity} ${order.symbol} submitted`);
          reset({ side: values.side, orderType: values.orderType });
        },
      },
    );
  });

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold tracking-tight">{instrument.symbol}</h2>
        <span className="font-mono text-sm tabular-nums">
          {money.format(instrument.currentPrice)}
        </span>
      </div>
      <p className="mt-0.5 text-xs text-slate-500">{instrument.name}</p>

      <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3" noValidate>
        <SegmentedControl
          options={[
            { value: OrderSide.BUY, label: 'Buy' },
            { value: OrderSide.SELL, label: 'Sell' },
          ]}
          value={side}
          onChange={(next) => setValue('side', next)}
          activeClass={side === OrderSide.BUY ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}
        />

        <SegmentedControl
          options={[
            { value: OrderType.MARKET, label: 'Market' },
            { value: OrderType.LIMIT, label: 'Limit' },
          ]}
          value={orderType}
          onChange={(next) => setValue('orderType', next)}
        />

        <TextField
          label="Quantity"
          type="number"
          min={1}
          step={1}
          placeholder="0"
          error={errors.quantity?.message}
          {...register('quantity', { setValueAs: asNumber })}
        />

        {orderType === OrderType.LIMIT && (
          <TextField
            label="Limit price"
            type="number"
            min="0.01"
            step="0.01"
            placeholder={instrument.currentPrice.toFixed(2)}
            error={errors.price?.message}
            {...register('price', { setValueAs: asNumber })}
          />
        )}

        <div className="flex justify-between border-t border-slate-100 pt-3 text-sm">
          <span className="text-slate-500">
            Estimated {side === OrderSide.BUY ? 'cost' : 'proceeds'}
          </span>
          <span className="font-mono tabular-nums">
            {estimate === null ? '—' : money.format(estimate)}
          </span>
        </div>

        {createOrder.isError && (
          <p className="text-sm text-red-600">{apiErrorMessage(createOrder.error)}</p>
        )}
        {placed && <p className="text-sm text-green-700">{placed}</p>}

        <Button
          type="submit"
          loading={createOrder.isPending}
          className={
            side === OrderSide.BUY
              ? 'bg-green-600 hover:bg-green-700'
              : 'bg-red-600 hover:bg-red-700'
          }
        >
          {side === OrderSide.BUY ? 'Place buy order' : 'Place sell order'}
        </Button>
      </form>

      <p className="mt-3 text-xs text-slate-400">
        Market orders price at the live quote when the exchange simulator fills them.
      </p>
    </div>
  );
}
