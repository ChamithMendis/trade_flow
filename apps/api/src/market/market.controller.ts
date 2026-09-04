import { Controller, Get, Param } from '@nestjs/common';
import type { InstrumentDto } from '@tradeflow/shared-types';
import { InstrumentsService } from './instruments.service';

@Controller('instruments')
export class MarketController {
  constructor(private readonly instruments: InstrumentsService) {}

  @Get()
  findAll(): Promise<InstrumentDto[]> {
    return this.instruments.findAll();
  }

  @Get(':symbol')
  findOne(@Param('symbol') symbol: string): Promise<InstrumentDto> {
    return this.instruments.findBySymbol(symbol);
  }
}
