import { get } from '../database/db.js';
import { forbidden, unauthorized } from '../utils/httpError.js';
import { verifyAccessToken } from '../utils/tokens.js';

function bearerToken(req) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme === 'Bearer' && token) return token.trim();
  return null;
}

export function requireAuth(req, res, next) {
  const token = bearerToken(req);
  if (!token) {
    next(unauthorized('Authentication is required.'));
    return;
  }

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    next(unauthorized('Session is invalid or expired.'));
    return;
  }

  get('SELECT id, tenant_id AS "tenantId", role, status FROM users WHERE id = ?', [Number(payload.sub)])
    .then((user) => {
      if (!user || user.status !== 'ACTIVE') {
        next(unauthorized('Account is not active.'));
        return;
      }
      req.auth = {
        userId: user.id,
        tenantId: user.tenantId,
        role: user.role,
        email: payload.email,
      };
      next();
    })
    .catch(next);
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.auth) {
      next(unauthorized('Authentication is required.'));
      return;
    }
    if (!roles.includes(req.auth.role)) {
      next(forbidden('You do not have permission to perform this action.'));
      return;
    }
    next();
  };
}
