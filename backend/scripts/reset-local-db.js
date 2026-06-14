import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..');
const dbPath = process.env.DB_PATH || path.join(backendRoot, 'data', 'agentassist.sqlite');

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new DatabaseSync(dbPath);
try {
  const schema = fs.readFileSync(path.join(backendRoot, 'src', 'database', 'schema.sql'), 'utf8');
  const seed = fs.readFileSync(path.join(backendRoot, 'src', 'database', 'seed.sql'), 'utf8');
  db.exec(schema);
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec('DELETE FROM api_logs; DELETE FROM ai_insights; DELETE FROM tickets; DELETE FROM orders; DELETE FROM customers;');
  db.exec("DELETE FROM sqlite_sequence WHERE name IN ('api_logs','ai_insights','tickets','orders','customers')");
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(seed);
  console.log('Local SQLite database reset.');
} finally {
  db.close();
}
