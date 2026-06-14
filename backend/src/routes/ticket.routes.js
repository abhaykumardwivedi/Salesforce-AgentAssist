import express from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { createCase, createTicket, getTicket, listTickets, updateTicketStatus } from '../services/ticketService.js';

const router = express.Router();

router.get('/', asyncHandler(async (req, res) => {
  res.json(await listTickets());
}));

router.post('/', asyncHandler(async (req, res) => {
  const ticket = await createTicket(req.body);
  res.status(201).json(ticket);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  res.json(await getTicket(req.params.id));
}));

router.put('/:id/status', asyncHandler(async (req, res) => {
  res.json(await updateTicketStatus(req.params.id, req.body.status));
}));

router.post('/:id/create-case', asyncHandler(async (req, res) => {
  res.json(await createCase(req.params.id));
}));

export default router;
