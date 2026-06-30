import { get, now, run } from './db.js';
import { hashPassword } from '../utils/password.js';

const DEFAULT_TENANT = { name: 'Demo Workspace', slug: 'demo' };
const DEFAULT_ADMIN_EMAIL = 'admin@demo.test';
const DEFAULT_ADMIN_PASSWORD = 'ChangeMe123!';

export async function ensureSeedData() {
  await ensureDefaultTenant();
  await ensureSeedAdmin();
}

async function ensureDefaultTenant() {
  const existing = await get('SELECT id FROM tenants WHERE id = 1');
  if (existing) return;
  const createdAt = now();
  await run(
    'INSERT INTO tenants (name, slug, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    [DEFAULT_TENANT.name, DEFAULT_TENANT.slug, 'ACTIVE', createdAt, createdAt],
  );
}

async function ensureSeedAdmin() {
  const existing = await get('SELECT id FROM users LIMIT 1');
  if (existing) return;

  const tenant = await get('SELECT id FROM tenants ORDER BY id ASC LIMIT 1');
  if (!tenant) return;

  const email = (process.env.SEED_ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL).trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;
  const passwordHash = await hashPassword(password);
  const createdAt = now();

  await run(
    `INSERT INTO users (tenant_id, full_name, email, password_hash, role, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'OWNER', 'ACTIVE', ?, ?)`,
    [tenant.id, 'Workspace Owner', email, passwordHash, createdAt, createdAt],
  );

  if (!process.env.SEED_ADMIN_PASSWORD) {
    console.log(`Seed admin created: ${email} / ${DEFAULT_ADMIN_PASSWORD} (change this password after first login).`);
  }
}
