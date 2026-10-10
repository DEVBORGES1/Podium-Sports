import { Router } from 'express';
import { parse, uuidParam } from '../../lib/validation.js';
import { currentProfile } from '../../middlewares/auth.js';
import {
  adminOrdersQuery,
  createOrderSchema,
  idempotencyKeySchema,
  orderCodeParam,
  orderTokenSchema,
  quoteSchema,
  updatePaymentSchema,
  updateStatusSchema,
} from './orders.schemas.js';
import * as service from './orders.service.js';

/** Rotas públicas de pedido. Os limitadores são aplicados em app.ts. */
export const publicOrdersRouter = Router();

publicOrdersRouter.post('/orders/quote', async (req, res) => {
  res.json(await service.quoteCart(parse(quoteSchema, req.body)));
});

publicOrdersRouter.post('/orders', async (req, res) => {
  const idempotencyKey = parse(idempotencyKeySchema, req.get('Idempotency-Key'));
  const input = parse(createOrderSchema, req.body);
  const result = await service.createOrder(input, idempotencyKey);
  res.status(result.created ? 201 : 200).json({ order: result.order, accessToken: result.accessToken });
});

publicOrdersRouter.get('/orders/:code', async (req, res) => {
  const { code } = parse(orderCodeParam, req.params);
  const token = parse(orderTokenSchema, req.get('X-Order-Token'));
  res.set('Cache-Control', 'no-store');
  res.json(await service.getPublicOrder(code, token));
});

publicOrdersRouter.post('/orders/:code/whatsapp-opened', async (req, res) => {
  const { code } = parse(orderCodeParam, req.params);
  const token = parse(orderTokenSchema, req.get('X-Order-Token'));
  await service.markWhatsappOpened(code, token);
  res.status(204).end();
});

export const adminOrdersRouter = Router();

adminOrdersRouter.get('/orders', async (req, res) => {
  res.json(await service.listAdminOrders(parse(adminOrdersQuery, req.query)));
});
adminOrdersRouter.get('/orders/:id', async (req, res) => {
  const { id } = parse(uuidParam, req.params);
  res.json(await service.getAdminOrder(id));
});
adminOrdersRouter.patch('/orders/:id/status', async (req, res) => {
  const { id } = parse(uuidParam, req.params);
  const { status, note } = parse(updateStatusSchema, req.body);
  res.json(await service.updateOrderStatus(id, status, note, currentProfile(req).id));
});
adminOrdersRouter.patch('/orders/:id/payment', async (req, res) => {
  const { id } = parse(uuidParam, req.params);
  const { paymentStatus, note } = parse(updatePaymentSchema, req.body);
  res.json(await service.updatePaymentStatus(id, paymentStatus, note, currentProfile(req).id));
});
