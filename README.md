# Client Portal Dashboard

A secure full-stack client portal built with Next.js, TypeScript and Supabase.

## Live Demo

https://client-portal-dashboard.netlify.app

## Overview

Client Portal Dashboard provides authenticated users with a protected account area where they can manage profile information securely.

The application uses Supabase Authentication, PostgreSQL and Row Level Security to isolate user data and prevent unauthorized access.

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

RLS isolation was tested using multiple authenticated accounts.

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