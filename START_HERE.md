# Berry’s website — developer handoff

This archive contains the complete tracked source of the published Berry’s storefront, including the revised shopping homepage and approved logo.

## Stack
TypeScript, React 19, Vinext (Next.js-compatible routing), Cloudflare Workers, D1 (SQLite), Drizzle migrations, and R2 product-image storage.

## Start here
Use Node.js 22.13 or later and npm. Extract the ZIP, open the `berrys-website` folder in an editor, and run:

```sh
npm ci
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_tricky_salo.sql
npm run dev
```

Open the local URL printed by the dev server (normally http://localhost:5173).
These commands create a local database, separate from the hosted database. Apply the migration once per new local database, not on every startup.

## Local admin setup
Before starting the development server, create an untracked `.dev.vars` file:

```dotenv
OWNER_SETUP_ENABLED=true
STORE_OWNER_EMAIL=seedy@sites.test
```

The portable local development profile provides a development-only mock ChatGPT identity (`seedy@sites.test`). Open `/admin`, sign in using the local development sign-in link, then select **Set up my owner account**. This creates the administrator record and sample product inventory once. Mock authentication is not included in production.

In the hosted store, admin setup is restricted to the configured owner email and requires a real authenticated identity. Keep owner configuration and credentials in runtime secrets, never in client code.

## Main files
- `app/store.tsx`: storefront, search, product cards, shopping bag, checkout, and admin interface.
- `app/globals.css`: styling and responsive layouts.
- `app/catalog.ts`: initial sample catalogue and size definitions.
- `app/api/store/route.ts`: product CRUD, owner setup, inventory, atomic test checkout, and category sales totals.
- `app/api/media/route.ts`: admin image uploads to R2.
- `app/api/media/[...key]/route.ts`: product-image delivery.
- `app/chatgpt-auth.ts`: hosted ChatGPT identity helpers.
- `db/schema.ts` and `drizzle/`: database schema and migration.
- `public/images/berrys-logo.png`: approved name-and-cherry logo.
- `public/images/`: included sample product photography and other assets.
- `worker/index.ts` and `vite.config.ts`: Worker and framework integration.
- `.openai/hosting.json`: existing Site identity and storage bindings; contains no credentials.

## Implemented functionality
- Public storefront with persistent search, category shortcuts, product-focused banners, sorting, and size/availability filters.
- Product details, local favourites, shopping bag, size selection, and sold-out sizes.
- Admin product creation, editing, removal, photo upload, and separate S/M/L/XL stock quantities.
- Test checkout validates stock server-side and updates inventory and order records in an atomic database batch to prevent overselling.
- Admin graph ranks categories by units sold, with top 5 or top 10 selection. The graph starts empty until orders are recorded.

## Current status and deployment notes
- Checkout is TEST MODE. No payment processing, shipping integration, or confirmation email delivery is connected.
- Product names, prices, photos, brand copy, and policies are placeholders for review. Product photos were sourced from the reference store kayandquekids.com; the earlier lifestyle image came from kalestore.it. Replace sample photography and specifications with the store’s own assets before commercial launch.
- No production database records, uploaded R2 objects, user details, runtime secrets, Git credentials, dependency folders, or generated build output are included.
- This is a Cloudflare Worker-backed application, not a static HTML-only website. Hosting elsewhere requires equivalent database/storage bindings and adaptation of the dispatch-owned authentication integration.
- For an independent Cloudflare deployment, provision your own D1 database and R2 bucket, bind them as DB and BUCKET, apply migrations, and configure a verified authentication provider with an owner allowlist. Do not assume arbitrary incoming identity headers are trustworthy outside the existing Sites platform.
- The included hosting manifest identifies the existing Berry’s Site. For a separate project, use that new host’s deployment configuration and identity instead of overwriting the original Site.

## Verification
The production build and TypeScript check passed. Inventory SQL checks covered selling the last size units, overselling rejection, rejection of a multi-item order without partial stock changes, and recorded sales totals. Public access and anonymous admin-operation rejection were checked. Final visual browser QA of the revised shopping homepage was limited by the preview browser timeout.

## Source version
5dd9bf2021b6ea533f7e8dfef570a97004cb769b
