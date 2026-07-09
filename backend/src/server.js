import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(backendRoot, '..');

dotenv.config({ path: path.join(repoRoot, '.env') });
dotenv.config({ path: path.join(backendRoot, '.env'), override: true });

const { default: app } = await import('./app.js');
const { runMigrations } = await import('./database/migrate.js');
const { ensureSeedData } = await import('./database/bootstrap.js');

await runMigrations();
await ensureSeedData();

const port = process.env.PORT || 8080;

app.listen(port, () => {
  console.log(`Salesforce AgentAssist API running on http://localhost:${port}`);
});
