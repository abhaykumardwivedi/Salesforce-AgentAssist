import express from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { syncContact } from '../services/customerService.js';
import { getSalesforceStatus } from '../services/salesforceService.js';
import { createCase } from '../services/ticketService.js';

const router = express.Router();

router.get('/status', (req, res) => {
  res.json(getSalesforceStatus());
});

router.post('/customers/:id/sync-contact', asyncHandler(async (req, res) => {
  res.json(await syncContact(req.params.id));
}));

router.post('/tickets/:id/create-case', asyncHandler(async (req, res) => {
  res.json(await createCase(req.params.id));
}));

export default router;
