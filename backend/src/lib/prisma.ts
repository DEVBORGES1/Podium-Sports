import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  log: [{ emit: 'event', level: 'warn' }],
});

export type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
