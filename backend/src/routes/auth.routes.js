import express from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { authLimiter } from '../middleware/rateLimit.js';
import {
  getUserById,
  login,
  logout,
  publicUser,
  refresh,
  requestPasswordReset,
  resetPassword,
  sendEmailVerification,
  signup,
  verifyEmail,
} from '../services/authService.js';
import {
  emailVerifySchema,
  loginSchema,
  passwordResetRequestSchema,
  passwordResetSchema,
  refreshSchema,
  signupSchema,
} from '../validators/schemas.js';

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

router.post('/request-password-reset', authLimiter, validate(passwordResetRequestSchema), asyncHandler(async (req, res) => {
  res.json(await requestPasswordReset(req.body.email));
}));

router.post('/reset-password', authLimiter, validate(passwordResetSchema), asyncHandler(async (req, res) => {
  res.json(await resetPassword(req.body.token, req.body.password));
}));

router.post('/verify-email', validate(emailVerifySchema), asyncHandler(async (req, res) => {
  res.json(await verifyEmail(req.body.token));
}));

router.post('/resend-verification', authLimiter, requireAuth, asyncHandler(async (req, res) => {
  const user = await getUserById(req.auth.userId);
  await sendEmailVerification(user);
  res.json({ sent: true });
}));

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const user = await getUserById(req.auth.userId);
  res.json(publicUser(user));
}));

export default router;
