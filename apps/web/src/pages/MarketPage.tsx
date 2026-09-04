import { useState } from 'react';
import { apiErrorMessage } from '@/lib/api';
import { useInstruments } from '@/features/market/market.api';
import { useMarketSocket } from '@/features/market/useMarketSocket';
import { InstrumentsTable } from '@/features/market/InstrumentsTable';
import { OrderTicket } from '@/features/orders/OrderTicket';

function LiveBadge({ connected }: { connected: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
      <span
        className={`h-2 w-2 rounded-full ${connected ? 'animate-pulse bg-green-500' : 'bg-slate-300'}`}
      />
      {connected ? 'Live' : 'Disconnected'}
    </span>
  );
}

export function MarketPage() {
  const { data: instruments, isLoading, isError, error } = useInstruments();
  const { connected } = useMarketSocket();
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);

  // Derived, not stored: falls back to the first instrument until one is picked.
  const selected =
    instruments?.find((instrument) => instrument.symbol === selectedSymbol) ?? instruments?.[0];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Market</h1>
          <p className="mt-1 text-sm text-slate-500">
            Pick an instrument to trade. Prices move every few seconds over WebSockets.
          </p>
        </div>
        <LiveBadge connected={connected} />
      </div>

      {isLoading && <p className="text-sm text-slate-500">Loading instruments…</p>}
      {isError && <p className="text-sm text-red-600">{apiErrorMessage(error)}</p>}

      {instruments && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <InstrumentsTable
              instruments={instruments}
              selectedSymbol={selected?.symbol}
              onSelect={setSelectedSymbol}
            />
          </div>
          {selected && (
            <div className="lg:col-span-1">
              <OrderTicket instrument={selected} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
