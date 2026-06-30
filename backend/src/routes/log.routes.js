import express from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { getLogs } from '../services/logService.js';

const router = express.Router();

router.get('/', asyncHandler(async (req, res) => {
  res.json(await getLogs(req.auth.tenantId));
}));

export default router;
