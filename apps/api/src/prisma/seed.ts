import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '../generated/prisma/client';
import { createPrismaAdapter } from './prisma-adapter';

loadEnv({ path: resolve(process.cwd(), '../../.env') });

const prisma = new PrismaClient({ adapter: createPrismaAdapter() });

const STARTING_CASH = '100000.0000';

const INSTRUMENTS: { symbol: string; name: string; currentPrice: string }[] = [
  { symbol: 'TFLX', name: 'TradeFlex Holdings', currentPrice: '100.0000' },
  { symbol: 'NOVA', name: 'Nova Dynamics', currentPrice: '75.0000' },
  { symbol: 'APEX', name: 'Apex Industries', currentPrice: '250.0000' },
  { symbol: 'VERT', name: 'Vertex Materials', currentPrice: '40.0000' },
  { symbol: 'QUANT', name: 'Quantum Compute Co', currentPrice: '180.0000' },
];

async function main(): Promise<void> {
  // --- Admin user (+ portfolio) ---
  const adminEmail = 'admin@tradeflow.local';
  const passwordHash = await hash('admin12345');

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      name: 'TradeFlow Admin',
      email: adminEmail,
      passwordHash,
      role: 'ADMIN',
      portfolio: { create: { availableCash: STARTING_CASH } },
    },
  });
  console.log(`Admin ready: ${admin.email}`);

  // --- Instruments ---
  for (const instrument of INSTRUMENTS) {
    await prisma.instrument.upsert({
      where: { symbol: instrument.symbol },
      update: { name: instrument.name },
      create: instrument,
    });
  }
  console.log(
    `Instruments ready: ${INSTRUMENTS.map((i) => i.symbol).join(', ')}`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
