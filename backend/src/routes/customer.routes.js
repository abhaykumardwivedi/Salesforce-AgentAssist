import express from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { createCustomer, deleteCustomer, getCustomer, getCustomer360, listCustomers, syncContact, updateCustomer } from '../services/customerService.js';

const router = express.Router();

router.get('/', asyncHandler(async (req, res) => {
  res.json(await listCustomers());
}));

router.post('/', asyncHandler(async (req, res) => {
  const customer = await createCustomer(req.body);
  res.status(201).json(customer);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  res.json(await getCustomer(req.params.id));
}));

router.put('/:id', asyncHandler(async (req, res) => {
  res.json(await updateCustomer(req.params.id, req.body));
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  await deleteCustomer(req.params.id);
  res.status(204).send();
}));

router.get('/:id/360', asyncHandler(async (req, res) => {
  res.json(await getCustomer360(req.params.id));
}));

router.post('/:id/sync-contact', asyncHandler(async (req, res) => {
  res.json(await syncContact(req.params.id));
}));

export default router;
