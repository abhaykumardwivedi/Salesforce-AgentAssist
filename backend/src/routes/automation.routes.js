import express from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createRule, deleteRule, listRules, runSlaEscalation, updateRule } from '../services/automationService.js';
import { recordAudit } from '../services/auditService.js';
import { automationRuleSchema, automationRuleUpdateSchema } from '../validators/schemas.js';

const router = express.Router();

router.get('/rules', asyncHandler(async (req, res) => {
  res.json(await listRules(req.auth.tenantId));
}));

router.post('/rules', requireRole('OWNER', 'ADMIN'), validate(automationRuleSchema), asyncHandler(async (req, res) => {
  const rule = await createRule(req.auth.tenantId, req.body);
  await recordAudit({ tenantId: req.auth.tenantId, userId: req.auth.userId, action: 'AUTOMATION_RULE_CREATE', entity: 'automation_rule', entityId: rule.id });
  res.status(201).json(rule);
}));

router.put('/rules/:id', requireRole('OWNER', 'ADMIN'), validate(automationRuleUpdateSchema), asyncHandler(async (req, res) => {
  const rule = await updateRule(req.auth.tenantId, req.params.id, req.body);
  await recordAudit({ tenantId: req.auth.tenantId, userId: req.auth.userId, action: 'AUTOMATION_RULE_UPDATE', entity: 'automation_rule', entityId: rule.id });
  res.json(rule);
}));

router.delete('/rules/:id', requireRole('OWNER', 'ADMIN'), asyncHandler(async (req, res) => {
  await deleteRule(req.auth.tenantId, req.params.id);
  await recordAudit({ tenantId: req.auth.tenantId, userId: req.auth.userId, action: 'AUTOMATION_RULE_DELETE', entity: 'automation_rule', entityId: req.params.id });
  res.status(204).send();
}));

router.post('/sla-run', requireRole('OWNER', 'ADMIN'), asyncHandler(async (req, res) => {
  const escalated = await runSlaEscalation(req.auth.tenantId);
  await recordAudit({ tenantId: req.auth.tenantId, userId: req.auth.userId, action: 'AUTOMATION_SLA_RUN', entity: 'ticket', metadata: { escalated: escalated.length } });
  res.json({ escalated });
}));

export default router;
