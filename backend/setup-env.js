process.env.DB_PATH = ':memory:';
process.env.AI_PROVIDER = 'local';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-access-secret';
process.env.APP_ENCRYPTION_KEY = process.env.APP_ENCRYPTION_KEY || '0'.repeat(64);
