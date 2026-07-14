import express from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { getAnalyticsOverview, getCustomerRisk } from '../services/analyticsService.js';
import { getBenchmark } from '../services/benchmarkService.js';
import { notFound } from '../utils/httpError.js';

const router = express.Router();

router.get('/overview', asyncHandler(async (req, res) => {
  res.json(await getAnalyticsOverview(req.auth.tenantId));
}));

router.get('/benchmark', asyncHandler(async (req, res) => {
  res.json(await getBenchmark(req.auth.tenantId));
}));

router.get('/customers/:id/risk', asyncHandler(async (req, res) => {
  const risk = await getCustomerRisk(req.auth.tenantId, req.params.id);
  if (!risk) throw notFound('Customer not found.');
  res.json(risk);
}));

export default router;
