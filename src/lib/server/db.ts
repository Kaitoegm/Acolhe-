import { PrismaClient } from '@prisma/client';
const globalDb = globalThis as unknown as { acolhePrisma?: PrismaClient };
export const db = globalDb.acolhePrisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalDb.acolhePrisma = db;
