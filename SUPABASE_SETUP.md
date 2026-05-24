# OptiBrandz CRM Supabase Setup

The CRM is prepared to use Supabase Postgres through Prisma. Keep all Supabase credentials on the server/Vercel side only.

## 1. Create Supabase Project

1. Open https://supabase.com/dashboard and create a new project.
2. Choose a strong database password and save it privately.
3. Go to **Project Settings > Database > Connection string**.

Use two connection strings:

- `DATABASE_URL`: pooled connection string, port `6543`, for the running API.
- `DIRECT_URL`: direct connection string, port `5432`, for Prisma schema pushes and migrations.

## 2. Local Environment

Copy the example file:

```bash
cp server/.env.example server/.env
```

Fill these values in `server/.env`:

```bash
DATABASE_URL="postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://postgres:PASSWORD@db.PROJECT_REF.supabase.co:5432/postgres"
JWT_SECRET="make-a-long-random-secret"
CLIENT_URL="http://localhost:5173"
GEMINI_API_KEY="your-gemini-key"
```

## 3. Create Tables and Seed Demo Data

Run from the project root:

```bash
npm install
npm install --prefix server
npm run db:generate --prefix server
npm run db:push --prefix server
npm run db:seed --prefix server
```

This creates the CRM tables in Supabase and adds the current demo users, clients, leads, services, invoices, campaigns, content calendar items, tasks, and notifications.

## 4. Vercel Environment Variables

In Vercel, open the project and go to **Settings > Environment Variables**. Add:

```bash
DATABASE_URL
DIRECT_URL
JWT_SECRET
JWT_EXPIRES_IN
CLIENT_URL
GEMINI_API_KEY
GEMINI_MODEL
NODE_ENV=production
```

For `CLIENT_URL`, use your deployed Vercel URL, for example:

```bash
CLIENT_URL=https://crm-optibrandz.vercel.app
```

## 5. Important Notes

- Do not put Supabase service-role keys in the React frontend.
- The app currently keeps the UI/API shape from the local CRM. The schema and seed are ready for Supabase persistence; route-by-route database reads/writes should be migrated next so records no longer reset on server restart.
- Keep using the owner login after seeding: `alok@optibrandz.in` with password `admin123`, then change it in the database/admin flow before real production use.
