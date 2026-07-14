import express from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { classifyTicket, getAiStatus } from '../services/aiService.js';
import { executeAction, runCopilot } from '../services/copilotService.js';
import { answerQuestion } from '../services/retrievalService.js';
import { getCustomer360 } from '../services/customerService.js';
import { recordAudit } from '../services/auditService.js';
import { badRequest } from '../utils/httpError.js';
import { aiAnswerSchema, copilotActionSchema, copilotSchema } from '../validators/schemas.js';

const router = express.Router();

router.get('/status', asyncHandler(async (req, res) => {
  res.json(await getAiStatus(req.auth.tenantId));
}));

router.post('/classify-ticket', asyncHandler(async (req, res) => {
  if (!req.body.description || !req.body.description.trim()) {
    throw badRequest('Description is required.');
  }
  res.json(await classifyTicket(req.auth.tenantId, req.body.description));
}));

router.get('/customer-summary/:id', asyncHandler(async (req, res) => {
  const customer360 = await getCustomer360(req.auth.tenantId, req.params.id);
  res.json({ summary: customer360.aiCustomerSummary });
}));

router.post('/answer', validate(aiAnswerSchema), asyncHandler(async (req, res) => {
  res.json(await answerQuestion(req.auth.tenantId, req.body.question));
}));

router.post('/copilot', validate(copilotSchema), asyncHandler(async (req, res) => {
  res.json(await runCopilot(req.auth.tenantId, req.body.messages));
}));

// Execute a copilot-proposed action after the agent approves it.
router.post('/actions', validate(copilotActionSchema), asyncHandler(async (req, res) => {
  const result = await executeAction(req.auth.tenantId, req.auth.userId, req.body);
  await recordAudit({ tenantId: req.auth.tenantId, userId: req.auth.userId, action: `COPILOT_ACTION_${result.type}`, entity: 'ticket', entityId: result.ticketId });
  res.json(result);
}));

export default router;
