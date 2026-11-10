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

## Operations continuation
Added migration 0004: atomic quantity-limited admission records (live paid bookings only), private customer refund requests, admin review tracking, and inventory visibility controls. Refund review does not call the payment provider or mark an order refunded. QR scanning and automated confirmation mail remain pending. Public gateway continues returning 401 before application routing.
Supabase account discovery found Drivex (inactive), TrackCV (healthy), and F1 FoRgE company (inactive). None identifies this product; none was modified. D1 remains the source of truth. A Supabase migration needs a dedicated target and an explicit data/auth migration design; attaching an unrelated project would risk cross-product data access.

## Confirmation email continuation
Confirmation hooks now run after practice checkout and verified paid checkout, including webhook replay recovery. Booking email payloads are persisted, deliveries use provider idempotency, and concurrent retries are leased. A customer can retry their own confirmed booking email in the wallet. Provider errors preserve the confirmed booking; ambiguous deliveries older than 23 hours require operator review. No background queue or scheduled retry is configured. Resend credentials and a verified sender remain required. API acceptance is reported as sent; inbox delivery is not verified.

## Admission scanning continuation — 2026-11-09
Confirmed live-payment tickets now include a locally rendered version 3-L QR containing only the booking UUID. Practice and test-payment bookings do not display an admission QR. No ticket data is sent to a QR image provider.
The administrator selects a match, scans with the browser's native BarcodeDetector (when supported), or enters the booking reference. Lookup is administrator-only and checks match, confirmation and payment mode. Scanning never records entry: the operator reviews the guest, stand and remaining quantity, then confirms how many enter. The camera stops on scan, cancellation, match change and unmount. Camera permission is restricted to the site's own origin; microphone remains disabled. Unsupported browsers and denied camera permission retain manual lookup.
Migration 0006 adds transactional admission actions. Scanner retry keys deduplicate the same admission, reject mismatched reuse, and rollback attempts exceeding the purchased quantity. Existing manual admission callers remain compatible. UUID references are private identifiers, not proof of identity; operators must still verify venue entry policy. Staff roles beyond the existing administrator account remain future work.
Validation: 41 actual-handler integration checks; independent OpenCV decoding of 12 generated UUID QR codes in all four orientations. No local frontend compilation was possible: Bun, project node_modules and TypeScript compiler are absent in the editing sandbox. Use the platform build result for compilation status. Public host still returns HTTP 401 before application routing; real camera, mobile/print appearance, public booking and provider delivery are not browser-verified. The earlier generated-cover limitation remains unresolved. Provider refunds remain manual.

| Changed-surface security review | Result |
| --- | --- |
| Unauthorized lookup/admission and cross-match entry | Enforced server-side; covered by integration checks |
| Duplicate/over-quantity admission | Atomic database trigger and stable action keys; covered by integration checks |
| QR privacy/injection | UUID-only local SVG; parameterized lookup; no external QR service |
| Camera access | Same-origin only, explicit user action, video only, manual fallback |
| Social preview | Existing cover URL made absolute; generated artwork still blocked by account plan |


## Provider refunds — 2026-11-10
Superseding earlier refund-pending notes: administrators can issue the full recorded amount of a reviewed customer refund request, after confirming the booking and amount. Partial refunds and refunds after any admission are not supported. Provider status is shown privately in the wallet and successful refunds are labeled refunded.
The original Checkout Session must match the booking reference, amount, INR currency, paid state, live mode and PaymentIntent. Operations persist before the provider call, use immutable parameters and a stable refund/<order> idempotency key, lease concurrent attempts, and bound each provider call to 20 seconds. Unknown outcomes keep entry blocked. Creation retries older than 23 hours require manual provider reconciliation; known refund IDs are retrieved instead of recreated. Failed/canceled refunds also require operator reconciliation before any reinstatement.
Subscribe signed /api/webhook to refund.created, refund.updated and refund.failed in addition to checkout.session.completed. Refund notifications retrieve current provider status; delayed events cannot overwrite success. Notifications received before a refund ID is saved can be reconciled using Check provider status. No scheduled reconciliation worker is configured.
Database triggers exclude admission and refund initiation atomically. QR codes are hidden for started refunds. Gross sales, successful provider refunds and net sales are shown separately. Refunded ticket capacity is retained until authorized reissue; automatic inventory release and admission reinstatement remain future work.
Validation: 50 actual-handler integration checks pass, including ambiguous retries, prior-entry rejection, signed refund events, invalid provider data, immutable success and database entry blocking. Independent OpenCV decoding still passes for 12 QR UUIDs in four orientations. No real provider transaction was made. Actual payment/refund delivery, email inbox delivery, camera behavior, mobile/print rendering, public gateway access and launch branding remain unverified. Secure provider settings remain absent. Official Stripe refund, Checkout retrieval and idempotency documentation was reviewed on 2026-11-10.
