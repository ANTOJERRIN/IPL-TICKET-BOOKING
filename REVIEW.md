# Review guide

This branch adds ticket operations and an interactive stadium booking UI to the existing sales application.

## Ticket operations

- `sales-app/src/lib/shop.server.ts`: confirmation emails and retries, private refund requests, reviewed full provider refunds, signed refund reconciliation, match-scoped admission checks and inventory publication controls.
- `sales-app/migrations/0004_operations.sql` through `0007_provider_refunds.sql`: admission, email and refund records with transactional entry/refund exclusion.
- `sales-app/src/lib/admission-ui.tsx` and `ticket-qr.ts`: printable UUID QR codes and administrator scanning with manual fallback.
- `sales-app/tests/booking.mjs`: 50 actual-handler checks using SQLite and mocked providers.

## Stadium UI and localhost preview

- `sales-app/src/lib/stadium-picker.tsx`: projected stadium geometry, selectable stands, rotation/zoom/reset, top view and keyboard support.
- `sales-app/src/routes/index.tsx` and `styles.css`: refreshed homepage, stand cards, synchronized checkout and responsive styling.
- `local-preview/`: loopback-only preview using React, the actual booking handler and persistent local SQLite. Runtime customer data and generated assets are excluded from Git. Only compiled JavaScript/CSS are exposed from its runtime asset directory.

```sh
cd local-preview
npm ci
npm start
```

Open http://localhost:5173 and choose **Explore stadium**. Select Pavilion, then change quantity to verify the highlighted stand and checkout total stay synchronized. Sold-out stands and reserved booking selections are disabled.

In a second terminal, run `npm run test:ui` from `local-preview`. Run backend checks with `node --experimental-strip-types tests/booking.mjs` from `sales-app`.

## Validation and limits

Backend checks, stadium component checks, the catalogue-to-stand-to-quantity/total flow and CSS parsing passed. A standalone stadium rendering was inspected. Full desktop/mobile browser appearance and live camera interaction remain unverified because browser access was unavailable and app approval timed out.

Stadium geometry is illustrative; bookings grant stand access rather than assigned seats. Real payment/refund and email delivery need configured providers and authorized inventory. Refunded capacity remains held until operator-approved reissue; partial/post-admission refunds, admission reinstatement and scheduled reconciliation remain unimplemented. UI updates are local source work and have not been deployed to the hosted site.
