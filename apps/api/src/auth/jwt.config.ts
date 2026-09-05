import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt';
import type { StringValue } from 'ms';

/**
 * One JWT configuration, shared by AuthModule (issuing and verifying HTTP
 * tokens) and EventsModule (verifying the Socket.IO handshake), so the two can
 * never drift onto different secrets.
 */
export const jwtModule = JwtModule.registerAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService): JwtModuleOptions => ({
    secret: config.getOrThrow<string>('JWT_SECRET'),
    // e.g. "1d", "30m" — jsonwebtoken's `ms` string format.
    signOptions: {
      expiresIn: config.getOrThrow<string>('JWT_EXPIRES_IN') as StringValue,
    },
  }),
});
