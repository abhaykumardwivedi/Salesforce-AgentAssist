# Salesforce AgentAssist

Salesforce AgentAssist is a deployable, multi-tenant Customer 360 support application for service teams. It combines a React + Vite frontend, a Node.js + Express REST API, SQL persistence, OpenAI-powered ticket intelligence, Salesforce REST sync flows, Supabase PostgreSQL, pgvector embeddings, and API logging.

Each workspace (tenant) has its own users, customers, tickets, integrations, and encrypted credentials. Authentication uses JWT access and refresh tokens with role-based access control (OWNER, ADMIN, AGENT).

The app is written in plain JavaScript. There is no TypeScript in this project.

## Stack

- Frontend: React, Vite, JavaScript, HTML, CSS
- Backend: Node.js, Express REST API
- Local database: SQLite for fast development
- Production database: Supabase PostgreSQL
- AI: OpenAI Responses API for ticket classification and customer summaries
- Vector storage: pgvector on `ai_insights.embedding`
- CRM integration: Salesforce REST API
- Deployment: Vercel frontend, Render backend

## Authentication and Tenancy

- Every API route except `/health` and `/api/v1/auth/*` requires a Bearer access token.
- `POST /api/v1/auth/signup` creates a new workspace and its first OWNER user.
- Access tokens are short-lived; refresh tokens are stored hashed and rotated on use.
- All business data is scoped by `tenant_id`, so workspaces never see each other's data.
- A demo workspace and seed admin are created on first boot (`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`, default `admin@demo.test` / `ChangeMe123!`).

## Real Integrations

Integrations are configured per workspace from the Settings page and stored encrypted at rest (AES-256-GCM via `APP_ENCRYPTION_KEY`):

- Save an OpenAI API key per workspace to use real OpenAI classification, summaries, and Postgres embeddings.
- Connect Salesforce per workspace through the OAuth web-server flow; the platform registers one connected app and each tenant authorizes their own org.
- Set `DATABASE_URL` to a Supabase Postgres connection string to use hosted SQL and pgvector.

When a workspace has no OpenAI key, the app falls back to the demo `OPENAI_API_KEY` (if set) or local rule-based behavior, so development does not stop. The dashboard shows whether AI and Salesforce are running in real mode or local mode.

## Features

- Dashboard with customers, open tickets, high-priority tickets, Salesforce health, and AI provider status
- Customer management with create, read, update, and guarded delete
- Customer 360 profile with orders, tickets, total spend, open tickets, latest ticket, AI summary, and Salesforce Contact ID
- Ticket creation with OpenAI classification for category, priority, sentiment, and assignment team
- Ticket status updates
- Salesforce Contact sync and Case creation through real REST credentials
- Local fallback IDs for development when Salesforce credentials are not present
- API logs for OpenAI and Salesforce calls with response time and success state
- Health endpoint for deployment checks
- Supabase/PostgreSQL schema and seed data included
- pgvector-ready customer summary embeddings

## Project Structure

```text
backend/
  src/
    database/      Database connection, local SQLite schema, Postgres switch
    routes/        Express REST endpoints
    services/      Customers, tickets, OpenAI, Salesforce, logs
    middleware/    Async and error handling
    utils/         Shared HTTP error helpers
  scripts/         Production database setup script
  test/            Backend tests

frontend/
  src/
    api/           Axios API client
    components/    Reusable UI pieces
    pages/         Dashboard, Customers, Customer 360, Tickets, Logs, Salesforce
    utils/         Formatting helpers

docs/
  supabase-schema.sql   PostgreSQL schema with pgvector
  supabase-seed.sql     Portfolio seed data
  deployment-notes.md   Vercel, Render, Supabase, OpenAI, and Salesforce steps
```

## Local Development

Install dependencies:

```powershell
npm run install:all
```

Create a local `.env` from `.env.example`, then start both the backend and frontend together:

```powershell
npm run dev
```

Or run them in separate terminals:

```powershell
npm run dev:backend
npm run dev:frontend
```

Open:

```text
http://localhost:5173
```

Sign in to the seeded demo workspace with `admin@demo.test` / `ChangeMe123!`, or create a new workspace from the signup screen.

Backend API:

```text
http://localhost:8080/api/v1
```

Health check:

```text
http://localhost:8080/health
```

## Production Deployment

1. Create a Supabase project.
2. Copy the Supabase connection string.
3. Run the production schema and seed:

```powershell
$env:DATABASE_URL="your-supabase-connection-string"
npm run db:setup --prefix backend
```

4. Deploy `backend` to Render.
5. Set Render environment variables:

```text
NODE_ENV=production
NODE_VERSION=22
DATABASE_URL=your-supabase-connection-string
DATABASE_SSL=true
FRONTEND_ORIGIN=https://your-vercel-app.vercel.app

AI_PROVIDER=openai
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL=gpt-4.1-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small

SALESFORCE_ENABLED=true
SALESFORCE_MODE=REAL
SALESFORCE_LOGIN_URL=https://login.salesforce.com
SALESFORCE_CLIENT_ID=your-connected-app-client-id
SALESFORCE_CLIENT_SECRET=your-connected-app-client-secret
SALESFORCE_USERNAME=your-integration-user
SALESFORCE_PASSWORD=your-integration-user-password
SALESFORCE_SECURITY_TOKEN=your-security-token
SALESFORCE_API_VERSION=v60.0
```

6. Deploy `frontend` to Vercel.
7. Set Vercel environment variable:

```text
VITE_API_BASE_URL=https://your-render-api.onrender.com/api/v1
```

## Main API Routes

Auth (public):

- `POST /api/v1/auth/signup`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`

Workspace (Bearer token required):

- `GET /api/v1/customers`
- `POST /api/v1/customers`
- `GET /api/v1/customers/:id`
- `PUT /api/v1/customers/:id`
- `DELETE /api/v1/customers/:id`
- `GET /api/v1/customers/:id/360`
- `GET /api/v1/tickets`
- `POST /api/v1/tickets`
- `GET /api/v1/tickets/:id`
- `PUT /api/v1/tickets/:id/status`
- `GET /api/v1/ai/status`
- `POST /api/v1/ai/classify-ticket`
- `GET /api/v1/ai/customer-summary/:id`
- `GET /api/v1/salesforce/status`
- `GET /api/v1/salesforce/authorize-url`
- `POST /api/v1/salesforce/disconnect`
- `POST /api/v1/salesforce/customers/:id/sync-contact`
- `POST /api/v1/salesforce/tickets/:id/create-case`
- `GET /api/v1/logs`

Settings (OWNER/ADMIN):

- `GET /api/v1/settings/integrations`
- `PUT /api/v1/settings/integrations/openai`
- `POST /api/v1/settings/integrations/:provider/disconnect`
- `GET|POST /api/v1/settings/users`, `PUT /api/v1/settings/users/:id`
- `GET /api/v1/settings/audit`

## Client Walkthrough

1. Open Dashboard and show customer/ticket health, Salesforce mode, and AI provider mode.
2. Open Customers and select Rahul Sharma.
3. Show Customer 360: profile, orders, tickets, spend, AI summary, and Salesforce Contact ID.
4. Sync the customer to Salesforce and show the returned Contact ID.
5. Create a ticket with: `My payment was deducted twice and I need a refund urgently.`
6. Show OpenAI classification: Refund, High priority, Negative sentiment, Billing Support.
7. Open API Logs and show OpenAI/Salesforce calls with response times.
8. Explain that production clients connect their own OpenAI, Supabase, and Salesforce credentials through environment variables.

## Tests And Build

Backend tests:

```powershell
npm test --prefix backend
```

Frontend production build:

```powershell
npm run build --prefix frontend
```

Reset local seed data:

```powershell
npm run db:reset-local --prefix backend
```

## Salesforce OAuth

Register one Salesforce connected app for the platform and set the server variables:

```text
SALESFORCE_LOGIN_URL=https://login.salesforce.com
SALESFORCE_API_VERSION=v60.0
SALESFORCE_CLIENT_ID=your-connected-app-client-id
SALESFORCE_CLIENT_SECRET=your-connected-app-client-secret
SALESFORCE_REDIRECT_URI=https://your-render-api.onrender.com/api/v1/salesforce/oauth/callback
```

Add the same redirect URI to the connected app's callback URL list, and request the `api` and `refresh_token` scopes. Each workspace then clicks **Connect Salesforce** in Settings to authorize their own org. Access tokens are refreshed automatically with the stored refresh token, and all tokens are encrypted per tenant.
