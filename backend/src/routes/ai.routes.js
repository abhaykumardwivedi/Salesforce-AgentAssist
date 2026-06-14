import express from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { classifyTicket } from '../services/aiService.js';
import { getCustomer360 } from '../services/customerService.js';
import { badRequest } from '../utils/httpError.js';

const router = express.Router();

router.post('/classify-ticket', asyncHandler(async (req, res) => {
  if (!req.body.description || !req.body.description.trim()) {
    throw badRequest('Description is required.');
  }
  res.json(await classifyTicket(req.body.description));
}));

router.get('/customer-summary/:id', asyncHandler(async (req, res) => {
  const customer360 = await getCustomer360(req.params.id);
  res.json({ summary: customer360.aiCustomerSummary });
}));

export default router;
