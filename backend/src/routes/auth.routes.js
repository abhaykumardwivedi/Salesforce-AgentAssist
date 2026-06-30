import express from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { getUserById, login, logout, publicUser, refresh, signup } from '../services/authService.js';
import { loginSchema, refreshSchema, signupSchema } from '../validators/schemas.js';

const router = express.Router();

router.post('/signup', authLimiter, validate(signupSchema), asyncHandler(async (req, res) => {
  res.status(201).json(await signup(req.body));
}));

router.post('/login', authLimiter, validate(loginSchema), asyncHandler(async (req, res) => {
  res.json(await login(req.body));
}));

router.post('/refresh', validate(refreshSchema), asyncHandler(async (req, res) => {
  res.json(await refresh(req.body.refreshToken));
}));

router.post('/logout', validate(refreshSchema), asyncHandler(async (req, res) => {
  await logout(req.body.refreshToken);
  res.status(204).send();
}));

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const user = await getUserById(req.auth.userId);
  res.json(publicUser(user));
}));

export default router;
