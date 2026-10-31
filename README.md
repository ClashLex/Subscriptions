# Subscriptions

**Subscription and recurring revenue management for the fictional Brightloop Software.**

Subscriptions is an independent Make-A-Ton 9.0 project. It brings product and plan setup, customer contracts, recurring billing, discounts, taxes, invoices, and payment recording into one application. It is not an official Odoo product.

## Current status

The application is under active development. The table separates features available in the browser from features available through the API.

| Area | Available now |
|---|---|
| Browser | Sign in, customer registration and password reset; Admin and Staff catalogue, tax, plan, quotation template, and subscription screens; customer subscription list. |
| API | Authentication and roles; customer directory; catalogue and plans; quotation and subscription lifecycle; discount rules; recurring invoice generation; invoice reads and confirmation/cancellation; payment recording and reads. |
| Billing trigger | Admin-only `POST /api/v1/billing/run`, or an optional in-process scheduler. The scheduler is disabled by default. |
| Still to build | Invoice and payment screens, an Admin billing control, invoice email/PDF, finance dashboard, and fuller customer billing views. |

The main workflow is: configure a product and plan, create a customer subscription, submit and confirm its quotation, activate it, generate an invoice when due, confirm the invoice, and record payments. Billing and payment actions currently require an API client; the browser does not yet expose those controls.

**Pricing rule today:** invoice amounts come from the subscription's snapshotted product lines. The plan's `price` is displayed in the UI but does not determine the invoice total.

## Technology

- **Client:** React 19, TypeScript, Vite 8, Tailwind CSS 4.
- **Server:** Node.js, Express 5, TypeScript, Zod, MySQL2.
- **Database:** MySQL 8.4 with ordered SQL migrations.
- **Authentication:** MySQL-backed server sessions, HTTP-only cookies, and Argon2id password hashes.
- **Money:** decimal strings at API boundaries and integer minor units for calculations.

This is one modular application: the browser calls the versioned Express API, and the API reads and writes MySQL. During local development, Vite proxies `/api` requests to the server.

## Run locally

### Prerequisites

- Node.js **26** (see [.nvmrc](.nvmrc)) and npm.
- Docker with Compose for the supplied MySQL setup, or a compatible local MySQL 8.4 instance.
- Git.

The commands below use Windows PowerShell. On macOS/Linux, use `cp` instead of `Copy-Item` and `npm` instead of `npm.cmd`.

### 1. Configure the environment and database

From the repository root:

```powershell
Copy-Item .env.example .env
```

Edit `.env` before starting anything. Set `DB_PASSWORD`, `MYSQL_ROOT_PASSWORD`, and a random `SESSION_SECRET` of at least 32 characters. Set `SEED_ADMIN_EMAIL` and a strong `SEED_ADMIN_PASSWORD` for the demo Admin account. The example values are placeholders; `.env` is ignored by Git. The same file is read by Docker Compose and the API.

```powershell
docker compose up -d mysql
```

If using an existing MySQL server, create the database and application user named in `.env` and skip the Compose command.

### 2. Install dependencies, migrate, and seed

```powershell
Set-Location server
npm.cmd ci
npm.cmd run migrate
npm.cmd run seed
```

`migrate` applies pending files in `server/migrations/` and records them in `schema_migrations`. `seed` creates or updates the Admin account from `.env`; it does not create a full demo dataset.

### 3. Start the API and browser

In the server terminal:

```powershell
npm.cmd run dev
```

In a second terminal, from the repository root:

```powershell
Set-Location client
npm.cmd ci
npm.cmd run dev
```

Open **http://localhost:5173**. The API listens on **http://localhost:4000**. A ready database should make **http://localhost:4000/api/v1/health** return `data.status: "ready"`; it returns HTTP 503 when the database is unavailable.

For a compiled API run, execute `npm.cmd run build` and then `npm.cmd run start` from `server/`. The client production bundle is created with `npm.cmd run build` from `client/`. A public deployment still needs HTTPS, a reverse proxy for `/api`, persistent MySQL, and environment-specific configuration.

## Roles and workflow

| Role | Main access |
|---|---|
| Admin | Configure products, variants, taxes, and plans; manage users; run billing; manage subscriptions and finance records. |
| Staff | Read catalogue configuration; create and edit quotation templates and subscriptions; confirm invoices and record payments through the API. |
| Customer | Register and sign in; see their own subscriptions in the portal and their own invoices/payments through the API. |

Subscriptions follow **Draft → Quotation → Confirmed → Active**. Active subscriptions may be paused, resumed, closed, or renewed according to plan policy. Invoice generation snapshots line prices, tax, and any eligible discount. A unique database key prevents duplicate invoices for the same subscription period. Payments can cover part or all of a confirmed invoice; overpayments are rejected.

The optional scheduler uses `BILLING_RUN_INTERVAL_MINUTES` in `.env`. A positive value starts periodic runs after the configured interval. Leave it blank or set it to `0` to use only the Admin API trigger. The scheduler has not yet been verified in a live deployment.

Password reset uses SMTP when configured. In local development without SMTP, the reset link is logged by the server and returned to the browser as a development link.

## Checks

With the server and database running, run the API acceptance scripts from `server/`:

```powershell
npm.cmd run test:auth
npm.cmd run test:catalogue
npm.cmd run test:subscriptions
npm.cmd run test:billing
```

These scripts create test records in the configured database, so use a local test or demo database. The billing suite covers its daily invoice path; weekly, monthly, yearly, concurrent-run, and large-dataset cases still need broader verification.

The checks below do not require the running API:

```powershell
# From server/
npm.cmd run typecheck
npm.cmd run build

# From client/
npm.cmd run test:api
npm.cmd run lint
npm.cmd run build
```

The latest local pre-push review passed these static checks. The live API suites were not rerun in that environment because MySQL and the API were unavailable. The [changelog](docs/CHANGELOG.md) records test evidence and remaining gaps.

## Repository map

| Path | Contents |
|---|---|
| `client/src/pages/` | Role-specific React pages. |
| `client/src/lib/api.ts` | Shared browser API client and response handling. |
| `server/src/modules/` | API routes, schemas, and business services. |
| `server/src/jobs/` | Optional billing scheduler. |
| `server/migrations/` | Ordered MySQL schema changes. |
| `server/scripts/` | Migration, seed, and API acceptance scripts. |
| `docs/CHANGELOG.md` | Tracked record of implementation changes, checks, and open gaps. |

## Documentation in Git

Git tracks this README and [docs/CHANGELOG.md](docs/CHANGELOG.md).