import { apiErrorMessage } from '@/lib/api';
import { useInstruments } from '@/features/market/market.api';
import { useMarketSocket } from '@/features/market/useMarketSocket';
import { InstrumentsTable } from '@/features/market/InstrumentsTable';

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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Market</h1>
          <p className="mt-1 text-sm text-slate-500">
            Simulated instruments. Prices move every few seconds over WebSockets.
          </p>
        </div>
        <LiveBadge connected={connected} />
      </div>

      {isLoading && <p className="text-sm text-slate-500">Loading instruments…</p>}
      {isError && <p className="text-sm text-red-600">{apiErrorMessage(error)}</p>}
      {instruments && <InstrumentsTable instruments={instruments} />}
    </div>
  );
}
