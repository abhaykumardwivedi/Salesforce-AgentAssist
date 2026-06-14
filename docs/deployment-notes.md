# Deployment Notes

This project is built for immediate portfolio deployment with a local development path and a production Supabase/PostgreSQL path.

## Recommended Cloud Setup

- Frontend: Vercel
- Backend: Render Web Service
- Database: Supabase PostgreSQL
- Vector search: Supabase pgvector on `ai_insights.embedding`

## Why This Stack

React + Vite keeps the frontend fast and simple. Node + Express keeps the API easy to explain. Supabase PostgreSQL gives you hosted Postgres, SQL access, backups, and pgvector support for future AI search or customer-summary embeddings.

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

## Zustand

Zustand is useful when many unrelated components need shared client state. This app currently fetches page data directly, which keeps the code easier to explain. Add Zustand later for authenticated user state, global filters, or cached Customer 360 state.
