import { Injectable, NotFoundException } from '@nestjs/common';
import type { InstrumentDto } from '@tradeflow/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import type { Instrument } from '../generated/prisma/client';
import { toInstrumentDto } from './instrument.mapper';

@Injectable()
export class InstrumentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<InstrumentDto[]> {
    const rows = await this.prisma.instrument.findMany({
      orderBy: { symbol: 'asc' },
    });
    return rows.map(toInstrumentDto);
  }

  async findBySymbol(symbol: string): Promise<InstrumentDto> {
    return toInstrumentDto(await this.getEntityBySymbol(symbol));
  }

  /** Entity form, for modules that need the Decimal price (Orders, Exchange). */
  async getEntityBySymbol(symbol: string): Promise<Instrument> {
    const instrument = await this.prisma.instrument.findUnique({
      where: { symbol: symbol.toUpperCase() },
    });
    if (!instrument) {
      throw new NotFoundException(`Instrument '${symbol}' not found`);
    }
    return instrument;
  }
}
