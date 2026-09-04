import { plainToInstance } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

class EnvVars {
  @IsString()
  DATABASE_URL!: string;

  @IsString()
  REDIS_URL!: string;

  @IsString()
  @MinLength(16, { message: 'JWT_SECRET must be at least 16 characters' })
  JWT_SECRET!: string;

  @IsString()
  JWT_EXPIRES_IN!: string;

  @IsString()
  WEB_ORIGIN!: string;

  @IsInt()
  API_PORT!: number;

  /** Price-engine tick in ms; 0 disables it. Defaults to 3000 when unset. */
  @IsOptional()
  @IsInt()
  @Min(0)
  MARKET_TICK_MS?: number;
}

export function validateEnv(config: Record<string, unknown>): EnvVars {
  const validated = plainToInstance(EnvVars, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(
      `Invalid environment:\n${errors.map((e) => `  - ${e.toString()}`).join('\n')}`,
    );
  }
  return validated;
}
