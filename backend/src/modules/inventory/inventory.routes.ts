import { Router } from 'express';
import { z } from 'zod';
import { parse } from '../../lib/validation.js';
import { currentProfile } from '../../middlewares/auth.js';
import { createMovementSchema, inventoryListQuery, movementsQuery, updateMinStockSchema } from './inventory.schemas.js';
import * as service from './inventory.service.js';

export const adminInventoryRouter = Router();

adminInventoryRouter.get('/inventory', async (req, res) => {
  res.json(await service.listInventory(parse(inventoryListQuery, req.query)));
});
adminInventoryRouter.get('/inventory/movements', async (req, res) => {
  res.json(await service.listMovements(parse(movementsQuery, req.query)));
});
adminInventoryRouter.post('/inventory/movements', async (req, res) => {
  const input = parse(createMovementSchema, req.body);
  res.status(201).json(await service.createMovement(input, currentProfile(req).id));
});
adminInventoryRouter.patch('/inventory/:productId', async (req, res) => {
  const { productId } = parse(z.object({ productId: z.uuid() }), req.params);
  const { minStock } = parse(updateMinStockSchema, req.body);
  res.json(await service.updateMinStock(productId, minStock, currentProfile(req).id));
});
