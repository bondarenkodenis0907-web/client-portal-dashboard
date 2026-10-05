# Client Portal Dashboard

A small B2B client portal built with Next.js, TypeScript, Supabase and PostgreSQL.

## Live Demo

https://client-portal-dashboard-one.vercel.app

## What it does

Authenticated users can:

- sign in with email and password
- manage their profile
- create service requests
- view only their own requests
- track request status and priority

Supabase Row Level Security is used to keep data isolated between users.

## Screenshots

### Dashboard

![Dashboard](public/screenshots/dashboard.png)

### Login

![Login](public/screenshots/login.png)

### Profile Management

![Profile Management](public/screenshots/profile.png)

## Features

- Supabase email/password authentication
- Persistent sessions
- Protected dashboard routes
- Profile management
- Service request creation and history
- Request priority and status
- PostgreSQL persistence
- Row Level Security
- Loading, error and empty states
- GitHub Actions CI
- Vercel deployment

## Tech Stack

- Next.js
- React
- TypeScript
- Supabase
- PostgreSQL
- Tailwind CSS
- GitHub Actions
- Vercel

## Database Security

The project currently has separate RLS policies for:

- user profiles
- service requests

Authenticated users can only read and modify rows that belong to their own account.

Database behavior is tested with pgTAP against a local Supabase instance in CI.

Examples covered by the tests:

- User A can read their own profile
- User A cannot update User B's profile
- User A can create their own service request
- User A cannot update or delete User B's request

## Design Decisions

- PostgreSQL RLS is the final authorization boundary rather than relying only on client-side filtering.
- Database tests run against local Supabase in CI, so production credentials are not required.
- Browser and server Supabase clients are kept separate for Next.js session handling.
- Service requests use `user_id` ownership so authorization stays enforced at the database layer.

## Application Flow

```text
User
  ↓
Supabase Auth
  ↓
Protected Next.js Dashboard
  ├── Profile
  └── Service Requests
        ↓
Supabase PostgreSQL
        ↓
Row Level Security
```

## CI

Pull requests and pushes to `main` run:

```text
npm ci
npm run lint
npx next typegen
npx tsc --noEmit
supabase start
supabase test db
```

GitHub Actions uses read-only repository permissions and does not require production Supabase credentials.

## Local Development

```bash
git clone https://github.com/bondarenkodenis0907-web/client-portal-dashboard.git
cd client-portal-dashboard
npm install
```

Create `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
```

Run:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## Project Structure

```text
src/
├── app/
│   ├── dashboard/
│   │   └── requests/
│   ├── login/
│   └── page.tsx
└── lib/
    └── supabase/

supabase/
├── migrations/
└── tests/
```
