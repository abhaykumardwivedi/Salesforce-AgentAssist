import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

const DEFAULT_ACCESS_TTL = '15m';
const DEFAULT_REFRESH_TTL_DAYS = 30;

function accessSecret() {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) throw new Error('JWT_ACCESS_SECRET is required.');
  return secret;
}

export function signAccessToken(user) {
  return jwt.sign(
    {
      sub: String(user.id),
      tenantId: user.tenantId,
      role: user.role,
      email: user.email,
    },
    accessSecret(),
    { expiresIn: process.env.JWT_ACCESS_TTL || DEFAULT_ACCESS_TTL },
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, accessSecret());
}

export function generateRefreshToken() {
  const token = crypto.randomBytes(48).toString('base64url');
  const tokenHash = hashRefreshToken(token);
  const days = Number(process.env.JWT_REFRESH_TTL_DAYS || DEFAULT_REFRESH_TTL_DAYS);
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  return { token, tokenHash, expiresAt };
}

export function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function signOauthState(payload) {
  return jwt.sign({ ...payload, purpose: 'oauth_state' }, accessSecret(), { expiresIn: '10m' });
}

export function verifyOauthState(token) {
  const decoded = jwt.verify(token, accessSecret());
  if (decoded.purpose !== 'oauth_state') throw new Error('Invalid OAuth state.');
  return decoded;
}
