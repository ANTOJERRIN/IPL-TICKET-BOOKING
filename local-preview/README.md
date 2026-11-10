# Local preview

Run `npm install`, then `npm start` in this folder. Requires Node 22.18 or newer.

Open http://localhost:5173. This runs the current sales-app storefront and its actual booking handler with a persistent local SQLite database. Accounts and practice bookings stay on this computer. Payment and email credentials are deliberately absent. Set `ADMIN_EMAIL` to a registered local account email before starting if you need to inspect administration.

Restart the server after changing application source. Runtime files and local customer data are excluded from Git.

With the preview running, use `npm run test:ui` in a second terminal to check stadium controls and the catalogue-to-checkout flow. Tests use the sample catalogue and do not create customer accounts or payments. The standalone stadium rendering is saved to `.runtime/stadium-render.png`.

The stadium is an illustrative stand picker with rotation, zoom, top view, keyboard selection and synchronized pricing. Exact venue geometry and individual seats are not represented. Full browser visual and mobile verification remain outstanding.
