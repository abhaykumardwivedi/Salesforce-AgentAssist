import express from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireRole } from '../middleware/auth.js';
import { syncContact } from '../services/customerService.js';
import { buildAuthorizeUrl, completeOAuth, disconnect, getSalesforceStatus } from '../services/salesforceService.js';
import { createCase } from '../services/ticketService.js';
import { recordAudit } from '../services/auditService.js';
import { signOauthState, verifyOauthState } from '../utils/tokens.js';

const router = express.Router();

router.get('/status', asyncHandler(async (req, res) => {
  res.json(await getSalesforceStatus(req.auth.tenantId));
}));

router.get('/authorize-url', requireRole('OWNER', 'ADMIN'), asyncHandler(async (req, res) => {
  const state = signOauthState({ tenantId: req.auth.tenantId });
  res.json({ url: buildAuthorizeUrl(state) });
}));

router.post('/disconnect', requireRole('OWNER', 'ADMIN'), asyncHandler(async (req, res) => {
  await disconnect(req.auth.tenantId);
  await recordAudit({ tenantId: req.auth.tenantId, userId: req.auth.userId, action: 'SALESFORCE_DISCONNECT', entity: 'integration' });
  res.json({ connected: false });
}));

router.post('/customers/:id/sync-contact', asyncHandler(async (req, res) => {
  res.json(await syncContact(req.auth.tenantId, req.params.id));
}));

router.post('/tickets/:id/create-case', asyncHandler(async (req, res) => {
  res.json(await createCase(req.auth.tenantId, req.params.id));
}));

// Public callback (Salesforce redirects here without an app session; tenant is carried in signed state).
export const salesforceOauthCallback = asyncHandler(async (req, res) => {
  const frontend = (process.env.FRONTEND_ORIGIN || 'http://localhost:5173').split(',')[0].trim();
  try {
    const { tenantId } = verifyOauthState(String(req.query.state || ''));
    await completeOAuth(tenantId, String(req.query.code || ''));
    await recordAudit({ tenantId, action: 'SALESFORCE_CONNECT', entity: 'integration' });
    res.redirect(`${frontend}/settings?salesforce=connected`);
  } catch (error) {
    res.redirect(`${frontend}/settings?salesforce=error`);
  }
});

export default router;
