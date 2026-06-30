# Deployment Notes

This project is built for immediate portfolio deployment with a local development path and a production Supabase/PostgreSQL path.

## Recommended Cloud Setup

- Frontend: Vercel
- Backend: Render Web Service
- Database: Supabase PostgreSQL
- AI provider: OpenAI
- CRM provider: Salesforce REST API
- Vector storage: Supabase pgvector on `ai_insights.embedding`

## Why This Stack

React + Vite keeps the frontend fast and simple. Node + Express keeps the API easy to explain. Supabase PostgreSQL gives you hosted Postgres, SQL access, backups, and pgvector support for customer-summary embeddings.

## Local vs Production Database

The current code uses SQLite only when `DATABASE_URL` is absent. When `DATABASE_URL` is present, the backend uses PostgreSQL through the `pg` package.

To prepare Supabase:

1. Create a Supabase project.
2. Copy the connection string.
3. Run:

```powershell
$env:DATABASE_URL="your-supabase-connection-string"
npm run db:setup --prefix backend
```

4. Set the same `DATABASE_URL` in Render.

## OpenAI

Set these variables in Render to activate real AI behavior:

```text
AI_PROVIDER=openai
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL=gpt-4.1-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
```

Ticket classification and Customer 360 summaries use the OpenAI Responses API. When the backend runs on Postgres, customer summary embeddings are stored in `ai_insights.embedding` using pgvector.

## Salesforce

Use local mode only for development:

```text
SALESFORCE_MODE=LOCAL
```

Use real mode for client deployments:

```text
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

## Zustand

Zustand is useful when many unrelated components need shared client state. This app currently fetches page data directly, which keeps the code easier to explain. Add Zustand later for authenticated user state, global filters, or cached Customer 360 state.
