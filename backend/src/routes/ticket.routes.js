import express from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createCase, createTicket, getTicket, listTickets, updateTicketStatus } from '../services/ticketService.js';
import { bulkImportTickets } from '../services/dataService.js';
import { getCustomer } from '../services/customerService.js';
import { draftReply } from '../services/copilotService.js';
import { findSimilarTickets } from '../services/retrievalService.js';
import { predictResolution } from '../services/analyticsService.js';
import { translateText } from '../services/languageService.js';
import { addMessage, assignTicket, listAssignees, listMessages } from '../services/conversationService.js';
import { recordAudit } from '../services/auditService.js';
import { bulkImportSchema, draftReplySchema, ticketAssignSchema, ticketMessageSchema, ticketSchema, ticketStatusSchema, translateSchema } from '../validators/schemas.js';

const router = express.Router();

router.post('/bulk', requireRole('OWNER', 'ADMIN'), validate(bulkImportSchema), asyncHandler(async (req, res) => {
  const result = await bulkImportTickets(req.auth.tenantId, req.body.rows);
  await recordAudit({ tenantId: req.auth.tenantId, userId: req.auth.userId, action: 'TICKET_BULK_IMPORT', entity: 'ticket', metadata: { created: result.created } });
  res.json(result);
}));

router.get('/', asyncHandler(async (req, res) => {
  res.json(await listTickets(req.auth.tenantId));
}));

// Static path — must be declared before '/:id' so it is not treated as an id.
router.get('/assignees', asyncHandler(async (req, res) => {
  res.json(await listAssignees(req.auth.tenantId));
}));

router.post('/', validate(ticketSchema), asyncHandler(async (req, res) => {
  const ticket = await createTicket(req.auth.tenantId, req.body);
  await recordAudit({ tenantId: req.auth.tenantId, userId: req.auth.userId, action: 'TICKET_CREATE', entity: 'ticket', entityId: ticket.id });
  res.status(201).json(ticket);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const ticket = await getTicket(req.auth.tenantId, req.params.id);
  res.json({ ...ticket, prediction: predictResolution(ticket) });
}));

router.get('/:id/similar', asyncHandler(async (req, res) => {
  const ticket = await getTicket(req.auth.tenantId, req.params.id);
  res.json(await findSimilarTickets(req.auth.tenantId, ticket, 5));
}));

router.post('/:id/draft-reply', validate(draftReplySchema), asyncHandler(async (req, res) => {
  const ticket = await getTicket(req.auth.tenantId, req.params.id);
  const customer = await getCustomer(req.auth.tenantId, ticket.customerId);
  const result = await draftReply(req.auth.tenantId, ticket, customer, req.body);
  await recordAudit({ tenantId: req.auth.tenantId, userId: req.auth.userId, action: 'TICKET_DRAFT_REPLY', entity: 'ticket', entityId: ticket.id });
  res.json(result);
}));

router.post('/:id/translate', validate(translateSchema), asyncHandler(async (req, res) => {
  const ticket = await getTicket(req.auth.tenantId, req.params.id);
  const result = await translateText(req.auth.tenantId, ticket.description, req.body.targetLanguage || 'English');
  res.json(result);
}));

router.get('/:id/messages', asyncHandler(async (req, res) => {
  res.json(await listMessages(req.auth.tenantId, req.params.id));
}));

router.post('/:id/messages', validate(ticketMessageSchema), asyncHandler(async (req, res) => {
  const message = await addMessage(req.auth.tenantId, req.params.id, {
    authorType: 'AGENT',
    authorUserId: req.auth.userId,
    body: req.body.body,
    isInternal: req.body.isInternal || false,
  });
  await recordAudit({ tenantId: req.auth.tenantId, userId: req.auth.userId, action: message.isInternal ? 'TICKET_NOTE_ADD' : 'TICKET_REPLY_ADD', entity: 'ticket', entityId: req.params.id });
  res.status(201).json(message);
}));

router.put('/:id/assign', validate(ticketAssignSchema), asyncHandler(async (req, res) => {
  const result = await assignTicket(req.auth.tenantId, req.params.id, req.body.userId);
  await recordAudit({ tenantId: req.auth.tenantId, userId: req.auth.userId, action: 'TICKET_ASSIGN', entity: 'ticket', entityId: req.params.id, metadata: { assignedUserId: result.assignedUserId } });
  res.json(result);
}));

router.put('/:id/status', validate(ticketStatusSchema), asyncHandler(async (req, res) => {
  const ticket = await updateTicketStatus(req.auth.tenantId, req.params.id, req.body.status);
  await recordAudit({ tenantId: req.auth.tenantId, userId: req.auth.userId, action: 'TICKET_STATUS_UPDATE', entity: 'ticket', entityId: ticket.id, metadata: { status: req.body.status } });
  res.json(ticket);
}));

router.post('/:id/create-case', asyncHandler(async (req, res) => {
  const result = await createCase(req.auth.tenantId, req.params.id);
  await recordAudit({ tenantId: req.auth.tenantId, userId: req.auth.userId, action: 'SALESFORCE_CASE_CREATE', entity: 'ticket', entityId: req.params.id });
  res.json(result);
}));

export default router;
