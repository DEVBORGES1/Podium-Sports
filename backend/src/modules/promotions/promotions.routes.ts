import { Router } from 'express';
import { parse, uuidParam } from '../../lib/validation.js';
import { currentProfile } from '../../middlewares/auth.js';
import { adminPromotionsQuery, createPromotionSchema, updatePromotionSchema } from './promotions.schemas.js';
import * as service from './promotions.service.js';

export const publicPromotionsRouter = Router();
publicPromotionsRouter.get('/promotions', async (_req, res) => {
  res.set('Cache-Control', 'public, max-age=60');
  res.json({ items: await service.listPublicPromotions() });
});

export const adminPromotionsRouter = Router();
adminPromotionsRouter.get('/promotions', async (req, res) => {
  const { active } = parse(adminPromotionsQuery, req.query);
  res.json({ items: await service.listAdminPromotions(active) });
});
adminPromotionsRouter.get('/promotions/:id', async (req, res) => {
  const { id } = parse(uuidParam, req.params);
  res.json(await service.getAdminPromotion(id));
});
adminPromotionsRouter.post('/promotions', async (req, res) => {
  const input = parse(createPromotionSchema, req.body);
  res.status(201).json(await service.createPromotion(input, currentProfile(req).id));
});
adminPromotionsRouter.patch('/promotions/:id', async (req, res) => {
  const { id } = parse(uuidParam, req.params);
  const input = parse(updatePromotionSchema, req.body);
  res.json(await service.updatePromotion(id, input, currentProfile(req).id));
});
adminPromotionsRouter.delete('/promotions/:id', async (req, res) => {
  const { id } = parse(uuidParam, req.params);
  await service.deletePromotion(id, currentProfile(req).id);
  res.status(204).end();
});
