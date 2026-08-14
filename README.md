# OptiBrandz CRM

Agency CRM for OptiBrandz Marketing Agency, Vapi — leads, clients, services and tasks,
content calendar, invoices, campaign results, monthly reports and team access, with a
Gemini-backed assistant.

Built to be used from a phone: it installs to the iPhone home screen and runs full screen.

## Stack

- **Client** — React 19, Vite, Tailwind CSS v4, React Router, Zustand, TanStack Query, Recharts
- **Server** — Node.js, Express 5, JWT, Zod, PDFKit, Prisma
- **Database** — Supabase Postgres

## Local development

```bash
npm install && npm install --prefix client && npm install --prefix server
cp server/.env.example server/.env   # then fill in the values
npm run db:generate --prefix server
npm run db:push --prefix server
npm run dev
```

Client runs on `http://localhost:5173`, API on `http://localhost:3001`.

There is no default password. Create the first owner account directly in the database with
a bcrypt hash, then change it from **Settings → Change your password** once you are in.

## Environment variables

Required in Vercel (and in `server/.env` locally):

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Pooled Supabase connection string (port 6543) |
| `DIRECT_URL` | Direct connection string (port 5432), used for schema pushes |
| `JWT_SECRET` | Long random string. The API refuses to boot in production without it |
| `JWT_EXPIRES_IN` | Token lifetime, e.g. `7d` |
| `CRON_SECRET` | Shared secret for the scheduled jobs below |
| `GEMINI_API_KEY` | Optional. Without it the AI section runs in demo mode |
| `GEMINI_MODEL` | Optional, defaults to `gemini-2.5-flash` |
| `CLIENT_URL` | Optional. Same-origin requests and this deployment's own URL are always allowed |

## Scheduled jobs

`node-cron` only fires inside a process that stays alive, so on Vercel the nightly work is
driven by Vercel Cron calling these routes with `Authorization: Bearer $CRON_SECRET`:

- `GET /api/cron/daily` — marks overdue invoices, files task and follow-up reminders
- `GET /api/cron/renewals` — warns about renewals due in the next 30 days

Both are configured in `vercel.json`. Running the server as a long-lived process
(`npm run start --prefix server`) registers the same jobs through node-cron instead.

## Installing on an iPhone

1. Open the CRM in Safari.
2. Tap Share → **Add to Home Screen**.
3. Launch it from the home screen. It runs full screen with no Safari chrome, and the
   layout clears the notch and the home indicator.

## Security notes

- All API routes except `/api/health`, `/api/auth/login` and the public invoice PDF require
  a bearer token, and each section is additionally gated by permission on the server.
- Invoice PDFs shared over WhatsApp are readable without a login by design — the link
  contains a random UUID and is served `noindex`.
- Eight failed sign-ins lock an account for 15 minutes.
- Never commit `server/.env`.
