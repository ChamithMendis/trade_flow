import { create } from 'zustand';

/** How many ticks each sparkline keeps. */
const MAX_POINTS = 40;

interface PriceHistoryState {
  history: Record<string, number[]>;
  lastChangePercent: Record<string, number>;
  /** Seeds a symbol from the initial REST fetch so sparklines aren't empty. */
  seed: (symbol: string, price: number) => void;
  push: (symbol: string, price: number, changePercent: number) => void;
}

export const usePriceHistoryStore = create<PriceHistoryState>()((set) => ({
  history: {},
  lastChangePercent: {},

  seed: (symbol, price) =>
    set((state) =>
      state.history[symbol]?.length ? state : { history: { ...state.history, [symbol]: [price] } },
    ),

  push: (symbol, price, changePercent) =>
    set((state) => {
      const next = [...(state.history[symbol] ?? []), price].slice(-MAX_POINTS);
      return {
        history: { ...state.history, [symbol]: next },
        lastChangePercent: { ...state.lastChangePercent, [symbol]: changePercent },
      };
    }),
}));
