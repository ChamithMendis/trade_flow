import { resolve } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validateEnv } from './config/env.validation';
import { AuthModule } from './auth/auth.module';
import { EventsModule } from './events/events.module';
import { MarketModule } from './market/market.module';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: resolve(process.cwd(), '../../.env'),
      validate: validateEnv,
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 10 }]),
    PrismaModule,
    EventsModule,
    UsersModule,
    AuthModule,
    MarketModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
