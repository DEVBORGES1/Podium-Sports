import { Router } from 'express';
import { currentProfile } from '../../middlewares/auth.js';
import { parse, uuidParam } from '../../lib/validation.js';
import { createCategorySchema, updateCategorySchema } from './categories.schemas.js';
import * as service from './categories.service.js';

export const publicCategoriesRouter = Router();
publicCategoriesRouter.get('/categories', async (_req, res) => {
  res.set('Cache-Control', 'public, max-age=60');
  res.json({ items: await service.listPublicCategories() });
});

export const adminCategoriesRouter = Router();
adminCategoriesRouter.get('/categories', async (_req, res) => {
  res.json({ items: await service.listAdminCategories() });
});
adminCategoriesRouter.post('/categories', async (req, res) => {
  const input = parse(createCategorySchema, req.body);
  const created = await service.createCategory(input, currentProfile(req).id);
  res.status(201).json(service.toCategoryDto(created));
});
adminCategoriesRouter.patch('/categories/:id', async (req, res) => {
  const { id } = parse(uuidParam, req.params);
  const input = parse(updateCategorySchema, req.body);
  res.json(service.toCategoryDto(await service.updateCategory(id, input, currentProfile(req).id)));
});
adminCategoriesRouter.delete('/categories/:id', async (req, res) => {
  const { id } = parse(uuidParam, req.params);
  await service.deleteCategory(id, currentProfile(req).id);
  res.status(204).end();
});
