import { afterAll } from 'vitest';
import { MemoryStorage, storage } from '../src/lib/storage.js';
import { prisma } from '../src/lib/prisma.js';

storage.set(new MemoryStorage());

afterAll(async () => {
  await prisma.$disconnect();
});
