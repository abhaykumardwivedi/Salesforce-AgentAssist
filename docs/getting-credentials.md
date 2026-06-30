# Getting Credentials & Switching from Mock to Real Mode

The app runs fully in **mock mode** with zero external accounts (SQLite database,
keyword-based AI classification, placeholder Salesforce IDs). When you are ready to
connect real services, follow the sections below. Each service is independent — you
can enable one without the others.

All settings live in the root `.env` file (copy from `.env.example`).

---

## 1. OpenAI (real AI classification, summaries, embeddings)

**What it powers:** ticket category/priority/sentiment classification, customer
summaries, and pgvector embeddings.

**Steps:**
1. Go to <https://platform.openai.com/signup> and create an account.
2. Add a payment method at <https://platform.openai.com/account/billing> (the models
   used here are inexpensive; classification of one ticket costs a fraction of a cent).
3. Create an API key at <https://platform.openai.com/api-keys> → **Create new secret key**.
   Copy it immediately (you cannot view it again).
4. In `.env` set:
   ```
   AI_PROVIDER=openai
   OPENAI_API_KEY=sk-...your key...
   OPENAI_MODEL=gpt-4.1-mini
   OPENAI_EMBEDDING_MODEL=text-embedding-3-small
   ```
5. Restart the backend. Confirm with:
   ```
   curl http://localhost:8080/api/v1/ai/status
   ```
   `mode` should change from `LOCAL_FALLBACK` to a configured OpenAI mode.

**To stay in mock mode:** leave `OPENAI_API_KEY` blank. The app falls back to
keyword-based classification automatically.

---

## 2. Salesforce (real Contact & Case creation)

**What it powers:** syncing a customer to a Salesforce Contact and creating a Case
from a ticket.

**Steps:**
1. Get a free Developer org at <https://developer.salesforce.com/signup>. Confirm the
   email and log in.
2. **Get your security token:** in Salesforce, click your avatar → **Settings** →
   **Reset My Security Token**. It is emailed to you. (Append it directly after your
   password when authenticating.)
3. **Create a Connected App:**
   - Setup (gear icon) → search **App Manager** → **New Connected App**.
   - Enable OAuth Settings. Callback URL can be `http://localhost/callback`.
   - OAuth scopes: add **Manage user data via APIs (api)** and **Perform requests at
     any time (refresh_token, offline_access)**.
   - Save, then open the app → **Manage Consumer Details** to get the
     **Consumer Key** (client id) and **Consumer Secret** (client secret).
4. In `.env` set:
   ```
   SALESFORCE_ENABLED=true
   SALESFORCE_MODE=REAL
   SALESFORCE_LOGIN_URL=https://login.salesforce.com
   SALESFORCE_CLIENT_ID=...consumer key...
   SALESFORCE_CLIENT_SECRET=...consumer secret...
   SALESFORCE_USERNAME=you@example.com
   SALESFORCE_PASSWORD=yourPassword
   SALESFORCE_SECURITY_TOKEN=...token from step 2...
   SALESFORCE_API_VERSION=v60.0
   ```
5. Restart the backend. Confirm with:
   ```
   curl http://localhost:8080/api/v1/salesforce/status
   ```
   `mode` should be `REAL` and `configured` `true`.

> **Note:** the username–password OAuth flow is being retired by Salesforce
> (Winter '27). It is fine for a demo/portfolio org. For long-term/production use,
> migrate to the JWT Bearer flow. The auth logic is isolated so it can be swapped.

**To stay in mock mode:** set `SALESFORCE_MODE=LOCAL`. The app returns realistic
placeholder IDs and still logs every call.

---

## 3. Supabase / PostgreSQL (production database)

**What it powers:** swaps the local SQLite file for a hosted Postgres database with
the `pgvector` extension (required to store real embeddings).

**Steps:**
1. Create a project at <https://supabase.com/dashboard>.
2. In the dashboard go to **Project Settings → Database → Connection string** and copy
   the **URI** (it looks like `postgresql://postgres:[PASSWORD]@db.xxx.supabase.co:5432/postgres`).
3. In `.env` set:
   ```
   DATABASE_URL=postgresql://postgres:...@db.xxx.supabase.co:5432/postgres
   DATABASE_SSL=true
   ```
4. Apply the schema and seed data:
   ```
   npm run db:setup --prefix backend
   ```
5. Restart the backend. Confirm with:
   ```
   curl http://localhost:8080/health
   ```
   `database.mode` should be `postgres`.

**To stay in mock mode:** leave `DATABASE_URL` blank. The app uses a local SQLite file
at `backend/data/agentassist.sqlite`.

---

## Quick reference: mock vs real

| Service     | Mock (default)              | Real                                  |
|-------------|-----------------------------|---------------------------------------|
| AI          | `OPENAI_API_KEY` blank      | set `OPENAI_API_KEY`                  |
| Salesforce  | `SALESFORCE_MODE=LOCAL`     | `SALESFORCE_MODE=REAL` + 6 creds      |
| Database    | `DATABASE_URL` blank        | set `DATABASE_URL` + run `db:setup`   |

You can mix and match — e.g. real OpenAI with mock Salesforce and local SQLite.
