import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { paged, pagination, parse } from '../../lib/validation.js';

const query = z.object({
  entityType: z.string().max(40).optional(),
  entityId: z.string().max(80).optional(),
  action: z.string().max(60).optional(),
  ...pagination,
});

export const adminAuditRouter = Router();
adminAuditRouter.get('/audit-logs', async (req, res) => {
  const q = parse(query, req.query);
  const where = {
    ...(q.entityType ? { entityType: q.entityType } : {}),
    ...(q.entityId ? { entityId: q.entityId } : {}),
    ...(q.action ? { action: { startsWith: q.action } } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      include: { profile: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
  ]);
  res.json(
    paged(
      rows.map((r) => ({
        id: r.id,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        metadata: r.metadata,
        createdAt: r.createdAt,
        user: r.profile,
      })),
      total,
      q.page,
      q.pageSize,
    ),
  );
});
