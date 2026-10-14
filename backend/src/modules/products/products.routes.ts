import { Router } from 'express';
import { z } from 'zod';
import { parse, uuidParam } from '../../lib/validation.js';
import { currentProfile } from '../../middlewares/auth.js';
import { imageUpload } from '../uploads/uploads.routes.js';
import {
  adminListQuery,
  createProductSchema,
  legacyMapQuery,
  podiumSchema,
  publicListQuery,
  reorderImagesSchema,
  updateImageSchema,
  updateProductSchema,
} from './products.schemas.js';
import * as service from './products.service.js';

export const publicProductsRouter = Router();

publicProductsRouter.get('/products', async (req, res) => {
  const query = parse(publicListQuery, req.query);
  res.json(await service.listPublicProducts(query));
});
publicProductsRouter.get('/products/legacy-map', async (req, res) => {
  const { ids } = parse(legacyMapQuery, req.query);
  res.json({ items: await service.legacyMap(ids) });
});
publicProductsRouter.get('/products/:idOrSlug', async (req, res) => {
  const { idOrSlug } = parse(z.object({ idOrSlug: z.string().min(1).max(180) }), req.params);
  res.json(await service.getPublicProduct(idOrSlug));
});

export const adminProductsRouter = Router();
const imageParams = z.object({ id: z.uuid(), imageId: z.uuid() });

adminProductsRouter.get('/products', async (req, res) => {
  res.json(await service.listAdminProducts(parse(adminListQuery, req.query)));
});
adminProductsRouter.get('/products/podium', async (_req, res) => {
  res.json(await service.listPodium());
});
adminProductsRouter.put('/products/podium', async (req, res) => {
  const { productIds } = parse(podiumSchema, req.body);
  res.json(await service.setPodium(productIds, currentProfile(req).id));
});
adminProductsRouter.get('/products/:id', async (req, res) => {
  const { id } = parse(uuidParam, req.params);
  res.json(await service.getAdminProduct(id));
});
adminProductsRouter.post('/products', async (req, res) => {
  const input = parse(createProductSchema, req.body);
  res.status(201).json(await service.createProduct(input, currentProfile(req).id));
});
adminProductsRouter.patch('/products/:id', async (req, res) => {
  const { id } = parse(uuidParam, req.params);
  const input = parse(updateProductSchema, req.body);
  res.json(await service.updateProduct(id, input, currentProfile(req).id));
});
adminProductsRouter.delete('/products/:id', async (req, res) => {
  const { id } = parse(uuidParam, req.params);
  await service.deleteProduct(id, currentProfile(req).id);
  res.status(204).end();
});

adminProductsRouter.post('/products/:id/images', imageUpload.array('images', 8), async (req, res) => {
  const { id } = parse(uuidParam, req.params);
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  res.status(201).json(await service.addImages(id, files, currentProfile(req).id));
});
adminProductsRouter.put('/products/:id/images/order', async (req, res) => {
  const { id } = parse(uuidParam, req.params);
  const { imageIds } = parse(reorderImagesSchema, req.body);
  res.json(await service.reorderImages(id, imageIds, currentProfile(req).id));
});
adminProductsRouter.patch('/products/:id/images/:imageId', async (req, res) => {
  const { id, imageId } = parse(imageParams, req.params);
  const input = parse(updateImageSchema, req.body);
  res.json(await service.updateImage(id, imageId, input, currentProfile(req).id));
});
adminProductsRouter.delete('/products/:id/images/:imageId', async (req, res) => {
  const { id, imageId } = parse(imageParams, req.params);
  res.json(await service.deleteImage(id, imageId, currentProfile(req).id));
});
