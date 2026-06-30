import express from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { createCase, createTicket, getTicket, listTickets, updateTicketStatus } from '../services/ticketService.js';
import { recordAudit } from '../services/auditService.js';
import { ticketSchema, ticketStatusSchema } from '../validators/schemas.js';

const router = express.Router();

router.get('/', asyncHandler(async (req, res) => {
  res.json(await listTickets(req.auth.tenantId));
}));

router.post('/', validate(ticketSchema), asyncHandler(async (req, res) => {
  const ticket = await createTicket(req.auth.tenantId, req.body);
  await recordAudit({ tenantId: req.auth.tenantId, userId: req.auth.userId, action: 'TICKET_CREATE', entity: 'ticket', entityId: ticket.id });
  res.status(201).json(ticket);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  res.json(await getTicket(req.auth.tenantId, req.params.id));
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
