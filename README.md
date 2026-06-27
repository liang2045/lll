# DingTalk AI Table Visualizer

A Next.js workspace for connecting DingTalk sheets and DingTalk AI tables, visualizing related data, and syncing edits between the frontend and table sources.

## Features

- DingTalk OAuth entrypoint with mock mode for local demos.
- Source connectors for DingTalk sheets and DingTalk AI tables.
- Normalized table cache backed by Prisma and SQLite.
- Editable data grid with optimistic writes.
- Polling-based sync and row hash conflict detection.
- Manual relation configuration between two sources.
- Dashboard charts and relation detail table.
- Dark, compact Grok-inspired UI.

## Local Setup

```bash
npm install
copy .env.example .env
npm run db:init
npm run dev
```

Open http://localhost:3000.

By default, `.env.example` uses `DINGTALK_MOCK=1`, so the app runs without real DingTalk credentials.

## Real DingTalk Setup

Set `DINGTALK_MOCK=0` and fill these values in `.env`:

```bash
DINGTALK_CLIENT_ID=""
DINGTALK_CLIENT_SECRET=""
DINGTALK_REDIRECT_URI="http://localhost:3000/api/auth/dingtalk/callback"
DINGTALK_API_BASE_URL="https://api.dingtalk.com"
```

The DingTalk adapter lives in `src/lib/dingtalk.ts`; adjust endpoint paths there if your DingTalk OpenAPI tenant uses a different document/table API shape.

## Scripts

```bash
npm run dev
npm run build
npm run lint
npm run db:init
```
