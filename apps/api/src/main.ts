import './config/load-env';

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:5173';
  app.enableCors({ origin: webOrigin, credentials: true });

  const config = new DocumentBuilder()
    .setTitle('TradeFlow API')
    .setDescription(
      'Simulated trading platform. Every route except `/`, `/health` and the two auth ' +
        'endpoints needs a bearer token from `POST /auth/login`.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'bearer',
    )
    .addTag('auth', 'Registration, login, current user')
    .addTag('market', 'Simulated instruments and prices')
    .addTag('orders', 'Order entry, listing and cancellation')
    .addTag('portfolio', 'Cash, positions and execution history')
    .build();

  // `persistAuthorization` keeps the token across page reloads while exploring.
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config), {
    swaggerOptions: { persistAuthorization: true },
  });

  const port = Number(process.env.API_PORT ?? 3000);
  await app.listen(port);

  console.log(`API listening on http://localhost:${port}`);
  console.log(`API docs at http://localhost:${port}/docs`);
}
void bootstrap();
