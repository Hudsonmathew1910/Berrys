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
| SMS OTP   | Firebase Phone Authentication (real SMS, verified on our server)                |
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

### The staff dashboard

The dashboard lives at a **secret address** set by `ADMIN_PATH` (e.g. `ADMIN_PATH=berrys-office-7k2` → `/berrys-office-7k2`). `/admin` does not exist. Anyone who isn't an active admin or staff member gets **Page not found** there.

Entering takes two steps: log in to the site with Google, then enter your **dashboard password**. The dashboard stays unlocked until you lock it, log out, or close the browser (12 hours at most).

- **First admin:** the `STORE_OWNER_EMAIL` Google account is always an admin. On its first visit it is asked to create the dashboard password.
- **Adding people:** an admin opens **Team & access**, enters a person's Google email and picks **Shop admin** or **Shop staff** (ticking the staff member's permissions). When that person logs in with that Google account and opens the dashboard address, they create their own password.
- **Permissions (staff):** orders & shipping, products, categories, offers, stock, payments, customers, sales & analytics, website content, issue refunds, delete products. Without _refunds_ / _delete products_, staff can **send a request** that an admin approves under **Requests**.
- **Admin only:** team & access, requests, activity log.
- **Forgotten password:** an admin clicks **Reset password** on the team page. If the only admin forgets theirs: `npm run reset-admin-password -- owner@gmail.com` (they then create a new one).

### What the dashboard does

| Section                  |                                                                                                                                                                        |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overview                 | 30-day revenue, orders, average order, trending products, low stock, orders to ship, waiting requests                                                                  |
| Orders                   | Search/filter/paginate; order page with items, customer, payment, status steps (packed → shipped → delivered), courier & tracking, internal note, full history, refund |
| Products                 | Search/filter/paginate; editor with up to 6 photos, category, gender, tags, MRP/price, badge, visibility, stock for each size; hide or delete                          |
| Categories               | Name, display order, visibility, and **its own sizes** (e.g. S–XL or 2-3Y…)                                                                                            |
| Offers                   | % or ₹ off the whole store, categories or products, between dates; best offer wins; applied at checkout too                                                            |
| Stock                    | Low-stock list, add/remove stock with a note, complete stock history (sales, releases, refunds, edits)                                                                 |
| Payments                 | Razorpay payments, totals collected and refunded                                                                                                                       |
| Customers                | Search/paginate; each customer's orders, spend and addresses                                                                                                           |
| Sales & analytics        | 7/30/90/365 days: revenue by day, best sellers, trending, by category, by size                                                                                         |
| Website content          | Announcement bar, home page text, footer text, help/policy pages                                                                                                       |
| Team, Requests, Activity | Admins: manage access, approve staff requests, see who changed what                                                                                                    |

## Login

One **Login / sign up** page (`/login`); new visitors get an account automatically.

- Customers log in with **Google** _or_ their **mobile number** (real SMS code). Either one is enough to log in, see orders and save favourites.
- **To buy, both are required.** At checkout the bag asks the customer to link the missing one (Google account or mobile number); the order then uses the verified email and number.
- Customers can also link the other method any time from **My account**. If someone had made two separate accounts (one per method), linking merges them, keeping all orders.
- A number or Google account that already belongs to another account can't be linked.
- The store owner logs in with the Google account set in `STORE_OWNER_EMAIL`.
- Sessions are random tokens in an `httpOnly` cookie (30 days); only a SHA-256 hash is stored.

### Google login setup (free)

1. [Google Cloud Console](https://console.cloud.google.com/) → your project → **Google Auth Platform**: app name `Berry's`, audience **External**.
2. **Clients → Create client** → _Web application_:
   - Authorized JavaScript origins: `http://localhost:3000` and `https://<domain>`.
   - Authorized redirect URIs: `http://localhost:3000/auth/google/callback` and `https://<domain>/auth/google/callback`.
3. Put the Client ID and secret in `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, set `SITE_URL`, restart.
4. **Audience → Publish app** so anyone can log in (in Testing, only listed test users can).

Note: Windows/system environment variables override `.env`. If login sends an old client ID, remove old `GOOGLE_CLIENT_*` variables from the system environment.

### Mobile OTP setup (Firebase Phone Authentication)

**Currently switched off** (`PHONE_LOGIN_ENABLED=false`): customers log in with Google, and checkout asks for a mobile number in a normal field. After the steps below, set `PHONE_LOGIN_ENABLED=true` to turn on mobile login and require a verified mobile to buy.

Firebase sends a real SMS code; no DLT registration or business documents are needed.

1. [Firebase console](https://console.firebase.google.com/) → **Add project** (you can pick the existing Google Cloud project).
2. **Build → Authentication → Get started → Sign-in method → Phone → Enable.**
3. **Authentication → Settings → Authorized domains:** add the live domain (`localhost` is there by default).
4. **Project settings → General → Your apps → Add app → Web**, then copy `apiKey` and `projectId` into `FIREBASE_API_KEY` / `FIREBASE_PROJECT_ID`.
5. **Upgrade to the Blaze plan** (a card is needed). Phone sign-in requires it; the first **10 SMS per day are free**, then Google charges per SMS (about $0.07 for India).
6. To test without spending SMS: **Sign-in method → Phone → Phone numbers for testing** — add a number with a fixed code.

Firebase protects SMS sending with an invisible reCAPTCHA; our server also rate-limits phone logins and checks Firebase's signed proof of the number.

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
app/(shop)/layout.tsx                 base template: header, category nav, footer (every customer page)
app/(shop)/page.tsx                   home
app/(shop)/shop                       catalogue: category, search, size/stock filters, sort, pagination (12/page)
app/(shop)/products/[id]              product detail + add to bag + related
app/(shop)/cart, checkout{,/success}  bag, checkout (saved/new address, Razorpay), confirmation
app/(shop)/account/*                  details, orders, order details (shipping timeline), favourites, addresses
app/(shop)/login, help/[slug]         login; size guide, shipping & returns, contact, story, privacy, terms
app/[dash]                            staff dashboard at /<ADMIN_PATH> (layout = access gate)
app/api/*                             JSON APIs (store, products, checkout, account, admin, webhooks)
components/shop/                      storefront UI
components/dashboard/                 dashboard UI
lib/admin/                            dashboard data (orders, catalog, insights, team)
lib/staff.ts                          roles, permissions, dashboard password & sessions
lib/                                  server logic (store-data, orders, addresses, users, session, …)
lib/help-pages.ts                     help/policy page copy (placeholder — replace before launch)
app/globals.css, app/shop.css         styles
public/images/berrys-logo-full.webp   footer logo · berrys-mark.webp header mark
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
- **Rate limits** (Postgres-backed, shared across server instances): checkout 10 per 10 min per IP; payment verify/cancel 30 per 10 min per IP; photo uploads 120 per hour per staff member; dashboard password 5 tries per 15 min. A shopper can hold at most 2 unpaid checkouts, so stock can’t be locked up by fake orders. Login is limited too: Google starts 30 per 10 min per IP; phone logins 20 per 15 min per IP, and Firebase applies its own SMS abuse protection.
- The dashboard address is secret (`ADMIN_PATH`), returns 404 to everyone else, and needs a separate scrypt-hashed password. Every dashboard change is recorded in the activity log.
- Search engines are told not to index `/account`, `/login` and the API.
- Every table has Row Level Security on with **no policies**, so the public Supabase API key cannot read or write store data. All access goes through this app’s server routes, which validate input (zod) and check admin rights.
- Prices and totals are always computed on the server.
- Mutating routes reject cross-origin requests. Razorpay payments and webhooks are verified with HMAC signatures.
- Run `npm audit --omit=dev` regularly and keep Next.js patched; security fixes ship often.
- Keep `SUPABASE_SERVICE_ROLE_KEY`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` and `DATABASE_URL` server-side only.

## Deploying (e.g. Vercel)

1. Import the repo and add every variable from `.env.example` (use `DATABASE_POOL_MAX=1` on serverless).
2. Set `SITE_URL` to the live domain, add `https://<domain>/auth/google/callback` to the Google OAuth client, and add the domain to Firebase's authorized domains.
3. In Razorpay, add the webhook `https://<domain>/api/webhooks/razorpay` with events `payment.captured` and `order.paid`.
4. Run `npm run db:migrate` against production once.

## Before launch: still to do

- **Replace product photos.** `public/images/product-*.webp` came from other stores’ websites and must not be used commercially.
- Replace sample product names, prices and descriptions (edit them in the dashboard → Products).
- Write the real size guide, shipping & returns policy and contact details (`components/store/info-modal.tsx`), and add privacy/terms pages (Razorpay requires them for live activation).
- Complete Razorpay KYC and switch to `rzp_live_` keys.
- Set shipping fees if you charge them (`NEXT_PUBLIC_SHIPPING_FEE`, `NEXT_PUBLIC_FREE_SHIPPING_ABOVE`).
- Publish the Google OAuth app; put the Firebase project on the Blaze plan for mobile OTP.
- Set up a sending domain with Resend for order confirmation emails (`RESEND_API_KEY`).
- Make sure `PAYMENT_MODE` is **not** set in production (it is ignored there anyway).
- Optional next steps: courier integration (e.g. Shiprocket) for labels and tracking, coupon codes, returns requests, GST invoices, CAPTCHA (e.g. Cloudflare Turnstile) on the mobile OTP form, product detail pages with their own URLs for SEO.
