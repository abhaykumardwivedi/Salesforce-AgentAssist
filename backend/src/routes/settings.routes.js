import express from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { disconnectIntegration, listIntegrations, saveIntegration } from '../services/integrationService.js';
import { createUser, listUsers, updateUser } from '../services/userService.js';
import { listAudit, recordAudit } from '../services/auditService.js';
import { openAiIntegrationSchema, userCreateSchema, userUpdateSchema } from '../validators/schemas.js';

const router = express.Router();

router.get('/integrations', asyncHandler(async (req, res) => {
  res.json(await listIntegrations(req.auth.tenantId));
}));

router.put('/integrations/openai', requireRole('OWNER', 'ADMIN'), validate(openAiIntegrationSchema), asyncHandler(async (req, res) => {
  await saveIntegration(req.auth.tenantId, 'OPENAI', {
    apiKey: req.body.apiKey,
    model: req.body.model || 'gpt-4.1-mini',
    embeddingModel: req.body.embeddingModel || 'text-embedding-3-small',
  });
  await recordAudit({ tenantId: req.auth.tenantId, userId: req.auth.userId, action: 'INTEGRATION_OPENAI_SAVE', entity: 'integration' });
  res.json(await listIntegrations(req.auth.tenantId));
}));

router.post('/integrations/:provider/disconnect', requireRole('OWNER', 'ADMIN'), asyncHandler(async (req, res) => {
  const provider = String(req.params.provider).toUpperCase();
  await disconnectIntegration(req.auth.tenantId, provider);
  await recordAudit({ tenantId: req.auth.tenantId, userId: req.auth.userId, action: 'INTEGRATION_DISCONNECT', entity: 'integration', entityId: provider });
  res.json(await listIntegrations(req.auth.tenantId));
}));

router.get('/users', requireRole('OWNER', 'ADMIN'), asyncHandler(async (req, res) => {
  res.json(await listUsers(req.auth.tenantId));
}));

router.post('/users', requireRole('OWNER', 'ADMIN'), validate(userCreateSchema), asyncHandler(async (req, res) => {
  const user = await createUser(req.auth.tenantId, req.body);
  await recordAudit({ tenantId: req.auth.tenantId, userId: req.auth.userId, action: 'USER_CREATE', entity: 'user', entityId: user.id });
  res.status(201).json(user);
}));

router.put('/users/:id', requireRole('OWNER', 'ADMIN'), validate(userUpdateSchema), asyncHandler(async (req, res) => {
  const user = await updateUser(req.auth.tenantId, req.params.id, req.body);
  await recordAudit({ tenantId: req.auth.tenantId, userId: req.auth.userId, action: 'USER_UPDATE', entity: 'user', entityId: user.id });
  res.json(user);
}));

router.get('/audit', requireRole('OWNER', 'ADMIN'), asyncHandler(async (req, res) => {
  res.json(await listAudit(req.auth.tenantId));
}));

export default router;
