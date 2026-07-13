import express from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { getWidgetPublicInfo, widgetAsk, widgetEscalate } from '../services/widgetService.js';
import { widgetAskSchema, widgetEscalateSchema } from '../validators/schemas.js';

// Public, unauthenticated router for the customer-facing self-service widget.
// Every handler is scoped by the tenant's public key in the path.
const router = express.Router();

router.get('/:key', asyncHandler(async (req, res) => {
  res.json(await getWidgetPublicInfo(req.params.key));
}));

router.post('/:key/ask', validate(widgetAskSchema), asyncHandler(async (req, res) => {
  res.json(await widgetAsk(req.params.key, req.body.question));
}));

router.post('/:key/escalate', validate(widgetEscalateSchema), asyncHandler(async (req, res) => {
  res.status(201).json(await widgetEscalate(req.params.key, req.body));
}));

export default router;
