import { InstrumentStatus, type InstrumentDto } from '@tradeflow/shared-types';
import type { Instrument } from '../generated/prisma/client';

/** Prisma returns Decimal for money columns; the wire format uses plain numbers. */
export function toInstrumentDto(instrument: Instrument): InstrumentDto {
  return {
    id: instrument.id,
    symbol: instrument.symbol,
    name: instrument.name,
    currentPrice: Number(instrument.currentPrice),
    status: instrument.status as InstrumentStatus,
    updatedAt: instrument.updatedAt.toISOString(),
  };
}
