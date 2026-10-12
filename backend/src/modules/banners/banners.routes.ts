import { Router } from 'express';
import { parse, uuidParam } from '../../lib/validation.js';
import { currentProfile } from '../../middlewares/auth.js';
import { createBannerSchema, updateBannerSchema } from './banners.schemas.js';
import * as service from './banners.service.js';

export const publicBannersRouter = Router();
publicBannersRouter.get('/banners', async (_req, res) => {
  res.set('Cache-Control', 'public, max-age=60');
  res.json({ items: await service.listPublicBanners() });
});

export const adminBannersRouter = Router();
adminBannersRouter.get('/banners', async (_req, res) => {
  res.json({ items: await service.listAdminBanners() });
});
adminBannersRouter.post('/banners', async (req, res) => {
  const input = parse(createBannerSchema, req.body);
  res.status(201).json(await service.adminView(await service.createBanner(input, currentProfile(req).id)));
});
adminBannersRouter.patch('/banners/:id', async (req, res) => {
  const { id } = parse(uuidParam, req.params);
  const input = parse(updateBannerSchema, req.body);
  res.json(await service.adminView(await service.updateBanner(id, input, currentProfile(req).id)));
});
adminBannersRouter.delete('/banners/:id', async (req, res) => {
  const { id } = parse(uuidParam, req.params);
  await service.deleteBanner(id, currentProfile(req).id);
  res.status(204).end();
});
