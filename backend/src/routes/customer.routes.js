import express from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createCustomer, deleteCustomer, getCustomer, getCustomer360, listCustomers, syncContact, updateCustomer } from '../services/customerService.js';
import { bulkImportCustomers } from '../services/dataService.js';
import { recordAudit } from '../services/auditService.js';
import { bulkImportSchema, customerSchema } from '../validators/schemas.js';

const router = express.Router();

router.post('/bulk', requireRole('OWNER', 'ADMIN'), validate(bulkImportSchema), asyncHandler(async (req, res) => {
  const result = await bulkImportCustomers(req.auth.tenantId, req.body.rows);
  await recordAudit({ tenantId: req.auth.tenantId, userId: req.auth.userId, action: 'CUSTOMER_BULK_IMPORT', entity: 'customer', metadata: { created: result.created, skipped: result.skipped } });
  res.json(result);
}));

router.get('/', asyncHandler(async (req, res) => {
  res.json(await listCustomers(req.auth.tenantId));
}));

router.post('/', validate(customerSchema), asyncHandler(async (req, res) => {
  const customer = await createCustomer(req.auth.tenantId, req.body);
  await recordAudit({ tenantId: req.auth.tenantId, userId: req.auth.userId, action: 'CUSTOMER_CREATE', entity: 'customer', entityId: customer.id });
  res.status(201).json(customer);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  res.json(await getCustomer(req.auth.tenantId, req.params.id));
}));

router.put('/:id', validate(customerSchema), asyncHandler(async (req, res) => {
  const customer = await updateCustomer(req.auth.tenantId, req.params.id, req.body);
  await recordAudit({ tenantId: req.auth.tenantId, userId: req.auth.userId, action: 'CUSTOMER_UPDATE', entity: 'customer', entityId: customer.id });
  res.json(customer);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  await deleteCustomer(req.auth.tenantId, req.params.id);
  await recordAudit({ tenantId: req.auth.tenantId, userId: req.auth.userId, action: 'CUSTOMER_DELETE', entity: 'customer', entityId: req.params.id });
  res.status(204).send();
}));

router.get('/:id/360', asyncHandler(async (req, res) => {
  res.json(await getCustomer360(req.auth.tenantId, req.params.id));
}));

router.post('/:id/sync-contact', asyncHandler(async (req, res) => {
  const result = await syncContact(req.auth.tenantId, req.params.id);
  await recordAudit({ tenantId: req.auth.tenantId, userId: req.auth.userId, action: 'SALESFORCE_CONTACT_SYNC', entity: 'customer', entityId: req.params.id });
  res.json(result);
}));

export default router;
