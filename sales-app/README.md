# Boundary Ticket Club sales application

This folder contains the complete hosted application source, including its provisioned template packages. The earlier Vite prototype remains in `../ipl-ticket-booking`.

Hosted build: https://boundary-ticket-club.higgsfield.app

## Review the sales implementation

- `src/routes/index.tsx`: storefront, single-match cart, buyer details, payment status, ticket wallet and sales dashboard.
- `src/lib/shop.server.ts`: authenticated checkout, inventory reservations, provider requests and signed payment notifications.
- `migrations/0002_booking.sql`: account, inventory and booking schema with overselling protection.
- `migrations/0003_sales.sql`: buyer details and stable provider checkout sessions.
- `tests/booking.mjs`: actual-handler integration checks using SQLite and mocked payment calls.
- `OPERATIONS.md`: configuration and known limitations.

## Run backend checks

Requires Node 22 or newer; no package installation is needed for these tests:

```sh
cd sales-app
node --experimental-strip-types tests/booking.mjs
```

27 integration checks passed in the cloud editing environment and again in the local workspace. Payment calls are mocked; no real charges were made.

## Runtime and configuration

React 19 and TanStack Start run in a Cloudflare Worker with D1 storage. `app.manifest.json` enables the database; deployment applies additive migrations. The included workspace packages and lockfile are the platform-provisioned dependencies. The original project's Vite commands do not run this application.

Configure `ADMIN_EMAIL`, `STRIPE_SECRET_KEY`, and `STRIPE_WEBHOOK_SECRET` in secure hosting settings. Password recovery additionally requires `RESEND_API_KEY` and `EMAIL_FROM`. Never commit secret values. The Stripe notification URL is `/api/webhook`.

## Current limits

No payment secrets or authorized real match inventory have been configured. Practice bookings do not grant stadium admission. The hosted build passed, but public browser verification encountered a gateway authentication restriction. Real provider testing, refunds, admission QR scanning and production operations remain unfinished. This branch is for review, not a declaration of production readiness.
