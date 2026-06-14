# Salesforce AgentAssist

Salesforce AgentAssist is a deployable portfolio application for Customer 360 support operations. It combines a React + Vite frontend, a Node.js + Express REST API, SQL persistence, AI-style ticket routing, Salesforce sync flows, and API logging.

The app is written in plain JavaScript. There is no TypeScript in this project.

## Stack

- Frontend: React, Vite, JavaScript, HTML, CSS
- Backend: Node.js, Express
- Local database: SQLite for quick development
- Production database: Supabase PostgreSQL
- Future AI search: pgvector on `ai_insights.embedding`
- Deployment: Vercel frontend, Render backend

## Features

- Dashboard with customers, open tickets, high-priority tickets, and integration health
- Customer management with create, read, update, and guarded delete
- Customer 360 profile with orders, tickets, total spend, open tickets, latest ticket, AI summary, and Salesforce Contact ID
- Ticket creation with deterministic AI classification
- Ticket status updates
- Salesforce Contact sync and Case creation in mock mode by default
- Real Salesforce REST integration path through environment variables
- API logs for AI and Salesforce calls
- Health endpoint for deployment checks
- Supabase/PostgreSQL schema and seed data included

## Project Structure

```text
backend/
  src/
    database/      SQLite connection and local SQL schema
    routes/        Express REST endpoints
    services/      Business logic for customers, tickets, AI, Salesforce, logs
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
  deployment-notes.md   Vercel, Render, and Supabase steps
```

## Local Development

Install dependencies:

```powershell
npm run install:all
```

Start the backend:

```powershell
npm run dev:backend
```

Start the frontend in another terminal:

```powershell
npm run dev:frontend
```

Open:

```text
http://localhost:5173
```

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
DATABASE_URL=your-supabase-connection-string
DATABASE_SSL=true
FRONTEND_ORIGIN=https://your-vercel-app.vercel.app
SALESFORCE_ENABLED=true
SALESFORCE_MODE=MOCK
SALESFORCE_API_VERSION=v60.0
```

6. Deploy `frontend` to Vercel.
7. Set Vercel environment variable:

```text
VITE_API_BASE_URL=https://your-render-api.onrender.com/api/v1
```

## Main API Routes

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
- `POST /api/v1/ai/classify-ticket`
- `GET /api/v1/ai/customer-summary/:id`
- `GET /api/v1/salesforce/status`
- `POST /api/v1/salesforce/customers/:id/sync-contact`
- `POST /api/v1/salesforce/tickets/:id/create-case`
- `GET /api/v1/logs`

## Portfolio Walkthrough

1. Open Dashboard and show customer/ticket health.
2. Open Customers and select Rahul Sharma.
3. Show Customer 360: profile, orders, tickets, spend, and AI summary.
4. Sync the customer to Salesforce and show the generated Contact ID.
5. Create a ticket with: `My payment was deducted twice and I need a refund urgently.`
6. Show the AI classification: Refund, High priority, Negative sentiment, Billing Support.
7. Open API Logs and show AI/Salesforce calls with response times.
8. Open Salesforce Status and explain how mock mode can be switched to real mode with environment variables.

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

## Salesforce Real Mode

Set these variables on Render when you have a Salesforce connected app and integration user:

```text
SALESFORCE_ENABLED=true
SALESFORCE_MODE=REAL
SALESFORCE_LOGIN_URL=https://login.salesforce.com
SALESFORCE_CLIENT_ID=
SALESFORCE_CLIENT_SECRET=
SALESFORCE_USERNAME=
SALESFORCE_PASSWORD=
SALESFORCE_SECURITY_TOKEN=
SALESFORCE_API_VERSION=v60.0
```

The username-password flow is included for portfolio compatibility. For a production client project, migrate this to JWT Bearer or OAuth web-server flow.
