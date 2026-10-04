# Client Portal Dashboard

A secure full-stack client portal built with Next.js, TypeScript and Supabase.

## Live Demo

https://client-portal-dashboard.netlify.app

## Overview

Client Portal Dashboard provides authenticated users with a protected account area where they can manage profile information securely.

The application uses Supabase Authentication, PostgreSQL and Row Level Security to isolate user data and prevent unauthorized access.
## Screenshots

### Dashboard

![Client Portal Dashboard](public/screenshots/dashboard.png)

### Login

![Login](public/screenshots/login.png)

### Profile Management

![Profile Management](public/screenshots/profile.png)

## Features

- Email and password authentication
- Persistent user sessions
- Protected dashboard routes
- User profile management
- PostgreSQL-backed profile data
- Row Level Security
- Loading states
- Error handling
- Retry flow
- Empty profile state
- Duplicate save protection
- Production deployment
- GitHub Actions CI

## Tech Stack

- Next.js
- React
- TypeScript
- Supabase
- PostgreSQL
- Tailwind CSS
- Netlify
- GitHub Actions

## Security

User data is protected using Supabase Row Level Security.

Each authenticated user can:

- Read their own profile
- Update their own profile
- Insert their own profile data

Users cannot read or modify another user's profile.

RLS isolation is covered by automated pgTAP tests that run in GitHub Actions against a local Supabase environment.

## Application Flow

```text
User
  ↓
Supabase Authentication
  ↓
Protected Next.js Dashboard
  ↓
Supabase PostgreSQL
  ↓
Row Level Security
```

## CI

GitHub Actions runs automated checks on pull requests and pushes to `main`.

Application checks:

```text
npm ci
npm run lint
npx next typegen
npx tsc --noEmit
```

Database security checks:

```text
supabase start
supabase test db
```

The database test suite runs against a local Supabase environment and verifies profile Row Level Security isolation between authenticated users.

The workflow uses read-only repository permissions and does not expose production Supabase secrets to pull request jobs.

## Deployment

The application is deployed on Netlify.

Production authentication URLs are configured separately from local development.

## Local Development

Clone the repository:

```bash
git clone https://github.com/bondarenkodenis0907-web/client-portal-dashboard.git
cd client-portal-dashboard
```

Install dependencies:

```bash
npm install
```

Create `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
```

Start the development server:

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
│   ├── login/
│   └── page.tsx
│
└── lib/
    └── supabase/
        ├── client.ts
        ├── server.ts
        └── proxy.ts
```

## Status

Deployed and operational.
