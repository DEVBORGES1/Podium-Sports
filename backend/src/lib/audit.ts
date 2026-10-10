import type { Prisma } from '@prisma/client';
import { prisma, type Tx } from './prisma.js';

export interface AuditEntry {
  profileId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  /** Somente dados relevantes e não sensíveis (nada de tokens, senhas ou contatos de clientes). */
  metadata?: Prisma.InputJsonValue;
}

export async function audit(entry: AuditEntry, tx: Tx | typeof prisma = prisma) {
  await tx.auditLog.create({
    data: {
      profileId: entry.profileId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      metadata: entry.metadata ?? undefined,
    },
  });
}

/** Lista apenas os campos alterados, no formato { campo: { from, to } }. */
export function diff<T extends Record<string, unknown>>(before: T, after: Partial<T>) {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(after)) {
    const a = before[key];
    const b = after[key];
    if (b === undefined) continue;
    const norm = (v: unknown) => (v instanceof Date ? v.toISOString() : v);
    if (JSON.stringify(norm(a)) !== JSON.stringify(norm(b))) changes[key] = { from: norm(a), to: norm(b) };
  }
  return changes;
}
