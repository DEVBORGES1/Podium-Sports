import { Router } from 'express';
import { currentProfile } from '../../middlewares/auth.js';
import { parse } from '../../lib/validation.js';
import { updateSettingsSchema } from './settings.schemas.js';
import { getSettings, toAdminSettings, toPublicSettings, updateSettings } from './settings.service.js';

export const publicSettingsRouter = Router();
publicSettingsRouter.get('/store/settings', async (_req, res) => {
  res.set('Cache-Control', 'public, max-age=60');
  res.json(toPublicSettings(await getSettings()));
});

export const adminSettingsRouter = Router();
adminSettingsRouter.get('/store/settings', async (_req, res) => {
  res.json(toAdminSettings(await getSettings()));
});
adminSettingsRouter.patch('/store/settings', async (req, res) => {
  const input = parse(updateSettingsSchema, req.body);
  const saved = await updateSettings(input, currentProfile(req).id);
  res.json(toAdminSettings(saved));
});
