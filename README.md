# OpenLens

Vite + React app with email auth and a restricted dashboard. Accounts live in Supabase Auth; a matching `profiles` row is created in the database on signup.

## Setup

1. Create a project at [supabase.com/dashboard](https://supabase.com/dashboard).
2. Run [`supabase/schema.sql`](supabase/schema.sql) in the SQL editor.
3. Copy `.env.example` to `.env` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from **Project Settings → API**.
4. For local testing, you can turn off **Confirm email** under **Authentication → Providers → Email**.
5. Install and run:

```bash
npm install
npm run dev
```

Public routes: `/`, `/login`, `/signup`. `/dashboard` requires a session.
