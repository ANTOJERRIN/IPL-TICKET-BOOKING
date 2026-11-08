# Boundary Ticket Club

Independent React 19 / TanStack Start storefront with same-Worker backend and D1 persistence. The existing local React prototype was inspected, but is not the hosted app's source.

## Configuration
Use the website's secure settings, never source code, for:
- ADMIN_EMAIL: exact email of a registered administrator. No first-user administrator promotion.
- STRIPE_SECRET_KEY: payment account secret. Test key first.
- STRIPE_WEBHOOK_SECRET: signing secret for POST /api/webhook, subscribed to checkout.session.completed.
- RESEND_API_KEY and EMAIL_FROM: verified sender for recovery mail.

All seeded matches are practice inventory and are not official fixtures. Practice checkout never charges money or grants entry. Add authorized real inventory through the administrator screen only after payments, operator support, tax treatment, legal terms and admission procedures are ready. Live payment keys alone do not turn sample matches into real inventory.

## Functionality
Signup/login/logout, PBKDF2 password hashing, hashed session tokens in secure HttpOnly cookies, per-user booking wallet, rate-limited auth endpoints, password reset with configured email, server-priced reservations, 30-minute holds, database-trigger inventory enforcement, idempotent reservation keys, practice confirmations, Stripe hosted checkout and signed webhook confirmations, cancellation of unpaid holds, printable booking references, admin match creation and order overview.

## Limits
Generated asset requests were rejected (Basic plan required). Authored SVG artwork is used; the generated-cover skill requirement remains unfulfilled. QR admission scanning, automated confirmation emails, confirmed-ticket refunds, advanced admin edits, email ownership verification, and production-grade abuse controls remain further work. Ticket barcode ornament is decorative; reference is the identifier, not a scannable barcode.

Late paid webhooks are recorded in payment_events with late: prefix for manual reconciliation/refund, never admitted after inventory expiry. Payment refund workflows require operator implementation. No real payment credentials or inventory have been provisioned by this build.

## Verification
Use separate practice customer accounts to check ownership isolation. Reserve all available tickets concurrently to check trigger rejection. Expired reservations must stop blocking availability and cannot confirm. Retrying a reservation idempotency key returns one order. Stripe webhooks must reject absent or bad signatures. Print a practice confirmation and verify no-admission marking.

## Observed validation
Production deployment passed on 2026-11-08. Live D1 schema verified through the connected read-only tool. tests/booking.mjs passed 16 integration checks using the actual handler and in-memory SQLite. Overselling and expiry SQL checks also passed. Live browser purchase flow remains unverified: the hosting gateway returned HTTP 401 unauthenticated to external requests, and the browser access host was unavailable. Resolve public gateway access before customer launch.

## First sales milestone
Buyer name, account email, phone and policy acceptance now persist atomically with reservations. Checkout uses one stable provider expiry per order for safe retries. Both checkout and webhook credentials are required for non-practice reservations. Only signed notifications can confirm provider-paid orders. Payment return pages poll order status. Administrator overview separates live collected revenue from test/practice bookings and surfaces late payment events. Real match times are formatted in India time.

27 integration checks pass, including simulated provider requests and cryptographically signed webhook tests. These do not verify a real Stripe account or public gateway access. Current secure settings inventory is empty.
