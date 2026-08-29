import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import type { RegisterRequest } from '@tradeflow/shared-types';

export class RegisterDto implements RegisterRequest {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(100)
  password!: string;
}
