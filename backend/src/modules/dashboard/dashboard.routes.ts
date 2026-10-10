import { Router } from 'express';
import { parse } from '../../lib/validation.js';
import { periodQuery, sales, summary, topProducts } from './dashboard.service.js';

export const adminDashboardRouter = Router();
adminDashboardRouter.get('/dashboard/summary', async (req, res) => {
  res.json(await summary(parse(periodQuery, req.query)));
});
adminDashboardRouter.get('/dashboard/sales', async (req, res) => {
  res.json(await sales(parse(periodQuery, req.query)));
});
adminDashboardRouter.get('/dashboard/top-products', async (req, res) => {
  res.json(await topProducts(parse(periodQuery, req.query)));
});
