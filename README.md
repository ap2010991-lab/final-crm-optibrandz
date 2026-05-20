# OptiBrandz CRM

Full-stack CRM platform for OptiBrandz Marketing Agency, built from the supplied specification.

## Stack

- Client: React, Vite, Tailwind CSS, React Router, Zustand, React Query, Recharts
- Server: Node.js, Express, JWT, Zod, PDFKit, node-cron
- Database target: PostgreSQL via Prisma

## Local Run

```bash
npm install
npm run dev
```

Client: `http://localhost:5173`
Server: `http://localhost:3001`

Demo owner login:

- Email: `alok@optibrandz.in`
- Password: `admin123`

The server includes a seeded in-memory data layer for immediate local testing. The full Prisma schema is included at `server/prisma/schema.prisma` for PostgreSQL deployment.

## Editing Demo Data

The app clearly marks the seeded records as demo data. Replace them from the normal CRM pages using the Add and Edit buttons on Clients, Leads, Services, Content, Invoices, and Campaigns. Dashboard numbers update from those same records.

## Daily Notifications

The bell icon opens Today’s Action Center. It automatically lists overdue and due-today work from the CRM: invoices, tasks, lead follow-ups, client renewals, and scheduled content. Each notification links back to the page where you can handle it.

## Vercel Deploy

This repo includes `vercel.json` and `api/index.js` so Vercel can build the React client and run the Express API as a serverless function.

In Vercel, add these environment variables:

- `JWT_SECRET`
- `JWT_EXPIRES_IN=7d`
- `GEMINI_API_KEY`
- `GEMINI_MODEL=gemini-2.5-flash`
- `CLIENT_URL=https://your-vercel-domain.vercel.app`

Do not commit `server/.env`; it is for local development only.
