# Berry’s storefront

An online store for Berry’s children’s clothing: a storefront with search, filters, favourites and a bag; Razorpay checkout; customer order history; and an admin workspace for products, per-size stock, orders and sales insights.

## Stack

| Layer     | Choice                                                                          |
| --------- | ------------------------------------------------------------------------------- |
| Framework | Next.js 16 (App Router), React 19, TypeScript                                   |
| Database  | Supabase Postgres, accessed with Drizzle ORM (`db/`, migrations in `drizzle/`)  |
| Auth      | Own accounts: Google login + mobile OTP, linked to one account (`lib/users.ts`) |
| Images    | Supabase Storage, public `product-images` bucket                                |
| Payments  | Razorpay Standard Checkout + webhook                                            |
| SMS OTP   | Pluggable: dev (terminal), Twilio Verify or MSG91 (`lib/sms.ts`)                |
| Email     | Resend (optional) for order confirmation emails to customers                    |
| Styling   | Hand-written CSS in `app/globals.css`, Tailwind 4 + shadcn/ui available         |

## First-time setup

1. **Node.js 22.13+** and `npm install`.
2. **Supabase:** create a project at supabase.com (used for the database and photo storage only).
3. **Google login:** see _Login_ below.
4. **Payments:** either create a Razorpay account and generate **test mode** API keys, or set `PAYMENT_MODE=mock` to simulate payments locally without any Razorpay account (dev server only).
5. `cp .env.example .env` and fill it in (comments explain each value).
6. `npm run db:migrate` creates the tables and the storage bucket.
7. `npm run dev` and open http://localhost:3000.

### Becoming the store admin

Set `STORE_OWNER_EMAIL` to your Google email, open `/admin`, log in with that Google account, verify your mobile number, then click **Set up my owner account**. This registers you as admin and loads the sample catalogue. It only works once, and only for that email.

Until then the storefront shows the sample catalogue as a read-only preview, with checkout switched off.

## Login

There is one **Login / sign up** page (`/login`). New visitors get an account automatically.

- **Continue with Google** or **mobile number + SMS code**, whichever the customer prefers.
- Every account links **both**: after the first method, the page asks for the other one (link Google, or verify the mobile number). From then on either one logs into the same account.
- If someone had made two half-accounts (one with Google, one with the number), linking merges them, keeping all orders.
- A number or Google account that already belongs to a different complete account can’t be linked.
- Sessions are random tokens in an `httpOnly` cookie (30 days); only a SHA-256 hash is stored in the `sessions` table.

### Google login setup (free)

1. [Google Cloud Console](https://console.cloud.google.com/) → create a project → **Google Auth Platform / OAuth consent screen**: app name `Berry’s`, support email, audience **External**.
2. **Clients → Create client** → _Web application_:
   - Authorized JavaScript origins: `http://localhost:3000` (and the live domain later).
   - Authorized redirect URIs: `http://localhost:3000/auth/google/callback` (and `https://<domain>/auth/google/callback` later).
3. Copy the Client ID and Client secret into `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, set `SITE_URL`, restart `npm run dev`.
4. While the app is in **Testing**, only the test users you add on the consent screen can log in (up to 100). Click **Publish app** to let anyone log in. The app only asks for basic profile/email, which doesn’t need Google’s verification review.

Google login has no per-login cost.

### Mobile OTP providers

| `SMS_PROVIDER` | Use            | Notes                                                                                                                                      |
| -------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `dev`          | Local testing  | No SMS sent; the code prints in the `npm run dev` terminal. Free. Refused in production.                                                   |
| `twilio`       | Launch         | Twilio Verify. Create a Verify service; set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`. Paid per verification. |
| `msg91`        | Launch (India) | Cheaper per SMS, but needs DLT registration (business documents) and an approved OTP template; set `MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID`.  |

SMS always costs money in India, and OTP endpoints are a target for “SMS pumping” fraud, so sending is rate-limited per IP and per number (3 per 15 min, 8 per day per number).

## How checkout works

1. The customer fills in name, email, mobile, address and PIN in the bag.
2. `POST /api/checkout` re-prices the bag from the database, **reserves the stock** in one transaction (no overselling), saves a `pending_payment` order and creates a Razorpay order.
3. The Razorpay window opens. On success the browser posts to `/api/checkout/verify`, which checks the HMAC signature and marks the order `paid`.
4. The Razorpay **webhook** (`/api/webhooks/razorpay`) does the same server-to-server, so the order is confirmed even if the customer closes the tab. Both paths are idempotent.
5. If the customer closes the payment window, or doesn’t pay within 30 minutes, the stock is released automatically.
6. If a payment arrives after the stock was released, the app re-reserves it. If it has sold out meanwhile, the order is marked **Refund needed** in the admin so you can refund it from the Razorpay dashboard.

Paid orders move through _Packed → Shipped → Delivered_ from the admin **Orders** tab.

**Mock payments (`PAYMENT_MODE=mock`)** replace step 3 with a simple “simulate payment?” prompt, so the whole order flow (stock, orders, admin, analytics) can be tested without a Razorpay account. It is hard-disabled in production builds.

## Project layout

```
app/
  page.tsx, admin/, login/, account/   pages
  api/store                            public catalogue + who is signed in
  api/checkout{,/verify,/cancel}       payment flow (+ /mock-pay, dev only)
  api/webhooks/razorpay                Razorpay webhook
  api/admin/*                          admin-only: setup, products, upload, orders, overview
  auth/google{,/callback}, auth/signout  Google login + logout
  api/auth/otp/{send,verify}           mobile OTP login / linking
components/store/                      storefront UI (header, grid, product modal, bag/checkout…)
components/admin/                      admin workspace UI
components/ui/                         shadcn/ui kit (vendored)
lib/                                   server logic: orders, store-data, auth, users, session, google, sms, razorpay, email, validation
db/schema.ts                           database schema (Drizzle)
drizzle/                               SQL migrations
```

## Scripts

| Command               | What it does                               |
| --------------------- | ------------------------------------------ |
| `npm run dev`         | Dev server on http://localhost:3000        |
| `npm run build`       | Production build                           |
| `npm start`           | Run the production build                   |
| `npm run lint`        | ESLint                                     |
| `npm run typecheck`   | TypeScript check                           |
| `npm run format`      | Prettier                                   |
| `npm run db:generate` | New migration after editing `db/schema.ts` |
| `npm run db:migrate`  | Apply migrations (uses `DIRECT_URL`)       |
| `npm run db:studio`   | Browse the database                        |

## Security notes

- **Security headers:** a strict Content-Security-Policy (scripts, frames and API calls only from this site, Supabase and Razorpay), HSTS, no framing, nosniff, and a locked-down Permissions-Policy (`next.config.ts`).
- **Rate limits** (Postgres-backed, shared across server instances): checkout 10 per 10 min per IP; payment verify/cancel 30 per 10 min per IP; photo uploads 60 per hour per admin. A shopper can hold at most 2 unpaid checkouts, so stock can’t be locked up by fake orders. Login is limited too: Google starts 30 per 10 min per IP; OTP sends 5 per 15 min per IP and 3 per 15 min per number; OTP checks 6 per 15 min per number, and each code locks after 5 wrong tries.
- **Uploads** are checked by their actual file bytes (JPEG/PNG/WebP only, 5 MB max), not the file name or claimed type.
- Search engines are told not to index `/admin`, `/account`, `/login` and the API.
- Every table has Row Level Security on with **no policies**, so the public Supabase API key cannot read or write store data. All access goes through this app’s server routes, which validate input (zod) and check admin rights.
- Prices and totals are always computed on the server.
- Mutating routes reject cross-origin requests. Razorpay payments and webhooks are verified with HMAC signatures.
- Run `npm audit --omit=dev` regularly and keep Next.js patched; security fixes ship often.
- Keep `SUPABASE_SERVICE_ROLE_KEY`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` and `DATABASE_URL` server-side only.

## Deploying (e.g. Vercel)

1. Import the repo and add every variable from `.env.example` (use `DATABASE_POOL_MAX=1` on serverless).
2. Set `SITE_URL` to the live domain and add `https://<domain>/auth/google/callback` to the Google OAuth client. Set `SMS_PROVIDER` to `twilio` or `msg91` with its keys.
3. In Razorpay, add the webhook `https://<domain>/api/webhooks/razorpay` with events `payment.captured` and `order.paid`.
4. Run `npm run db:migrate` against production once.

## Before launch: still to do

- **Replace product photos.** `public/images/product-*.webp` came from other stores’ websites and must not be used commercially.
- Replace sample product names, prices and descriptions (`lib/catalog.ts` seed data, or edit them in the admin).
- Write the real size guide, shipping & returns policy and contact details (`components/store/info-modal.tsx`), and add privacy/terms pages (Razorpay requires them for live activation).
- Complete Razorpay KYC and switch to `rzp_live_` keys.
- Set shipping fees if you charge them (`NEXT_PUBLIC_SHIPPING_FEE`, `NEXT_PUBLIC_FREE_SHIPPING_ABOVE`).
- Publish the Google OAuth app and pick an SMS provider (`twilio` / `msg91`).
- Set up a sending domain with Resend for order confirmation emails (`RESEND_API_KEY`).
- Make sure `PAYMENT_MODE` is **not** set in production (it is ignored there anyway).
- Optional next steps: courier integration (e.g. Shiprocket) for labels and tracking, refunds from the admin through the Razorpay API, CAPTCHA (e.g. Cloudflare Turnstile) on the mobile OTP form, product detail pages with their own URLs for SEO.
