import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { InstrumentDto } from '@tradeflow/shared-types';
import { InstrumentsService } from './instruments.service';

@ApiTags('market')
@ApiBearerAuth('bearer')
@Controller('instruments')
export class MarketController {
  constructor(private readonly instruments: InstrumentsService) {}

  /** Prices move on their own; subscribe to `market.price.updated` for live changes. */
  @ApiOperation({ summary: 'List simulated instruments' })
  @Get()
  findAll(): Promise<InstrumentDto[]> {
    return this.instruments.findAll();
  }

  @ApiOperation({ summary: 'Get one instrument by symbol' })
  @Get(':symbol')
  findOne(@Param('symbol') symbol: string): Promise<InstrumentDto> {
    return this.instruments.findBySymbol(symbol);
  }
}
