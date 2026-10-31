# Local Development Guide

> **Documentation update rule:** After every completed implementation step, update this file before beginning the next step. Change only information verified against the current code, database, tests, or running UI. Record the date, step completed, resulting behaviour, and any deviation or unresolved issue. Update `CHANGELOG.md` at the same time. Never mark an unimplemented or untested item as complete.

## 1. Prerequisites

- Node.js version supported by the current project dependencies (the earlier blueprint recommends a Node LTS release; verify the current release schedule and package support before selecting it).
- npm.
- MySQL 8.4 or a local Docker installation to run MySQL.
- Git.
- Code editor and an API client such as Postman, Bruno, or `curl`.

Check installed tools:

```bash
node --version
npm --version
git --version
mysql --version
```

## 2. Suggested project setup

```bash
mkdir subscriptions
cd subscriptions
git init
mkdir client server docs
```

Create a React TypeScript frontend with Vite:

```bash
npm create vite@latest client -- --template react-ts
cd client
npm install
npm install react-router-dom
```

Install Tailwind using the current official guide for the major version selected. Tailwind's Vite setup differs between major versions, so do not blindly reuse an old configuration snippet. Add form/query libraries only when they simplify the implementation.

Create the Express backend:

```bash
cd ../server
npm init -y
npm install express cors helmet express-rate-limit dotenv zod mysql2 argon2 express-session express-mysql-session node-cron nodemailer
npm install -D typescript tsx @types/node @types/express @types/cors @types/express-session
npx tsc --init
```

Use one consistent module system (ES modules or CommonJS) across TypeScript configuration, package settings, and imports.

## 3. Environment variables

Create `.env.example` with variable names and safe placeholders, for example:

```env
NODE_ENV=development
PORT=4000
APP_URL=http://localhost:5173
API_URL=http://localhost:4000
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=subscriptions
DB_USER=subscriptions_app
DB_PASSWORD=replace_me
SESSION_SECRET=replace_with_long_random_value
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASSWORD=
MAIL_FROM=
```

Keep actual secrets in a local `.env` ignored by Git or in a deployment secret manager. Never commit real credentials. Validate required environment variables at server startup and fail fast with a clear error.

## 4. Local MySQL option

Use either a local MySQL service or Docker Compose. If using Docker, pin the MySQL image to the intended major/minor version and use a persistent named volume. Bind the database port to localhost for local development rather than exposing it publicly.

Create a dedicated application database user; do not connect the application as `root`. Grant only the permissions needed by the runtime/migration strategy. Keep migration privileges separate from runtime privileges for production-like deployments.

## 5. Migrations and seed data

- Store migrations in `server/migrations/` with ordered filenames.
- Create a `schema_migrations` table.
- The migration runner checks which files have already been applied.
- Do not edit an applied shared migration; add a new migration instead.
- Keep seed data fictional and repeatable.
- Seed a demo Admin and sample records through a controlled script. Never place real credentials in the repository.

## 6. Run the application

Example scripts to add to `server/package.json` (adjust for the selected build configuration):

```json
{
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/src/server.js",
    "migrate": "tsx scripts/migrate.ts",
    "seed": "tsx scripts/seed.ts"
  }
}
```

Terminal 1 — backend:

```bash
cd server
npm run dev
```

Terminal 2 — frontend:

```bash
cd client
npm run dev
```

Verify the frontend loads, the health endpoint responds, and the API can run a simple database query. Add the actual scripts and URLs to the root README after confirming them.

## 7. Suggested Git workflow

- Commit a working skeleton before major feature work.
- Use small commits such as `feat: add plan creation API` or `fix: prevent duplicate billing periods`.
- Keep secrets, `.env`, build outputs, logs, and local database files out of Git.
- Run relevant tests before committing.
- Update docs and changelog in the same step as the code.
- Avoid large generated code dumps without reviewing and understanding them.

## 8. Troubleshooting checklist

### API cannot connect to MySQL

- Check service/container is running.
- Verify host, port, database, username, and password.
- Verify the database user has required privileges.
- Check MySQL logs.
- Check whether another process already uses the port.

### Frontend requests fail

- Verify API base URL.
- Verify CORS origin and credential settings.
- Verify session cookie domain, SameSite, and Secure flags for the environment.
- Inspect browser Network tab and backend logs.

### Migration fails

- Inspect the exact SQL error.
- Check migration ordering and foreign key dependencies.
- Verify the migration runner recorded only successfully applied migrations.
- Repair local development data carefully; do not reset a shared/production database casually.

## 9. Understanding the codebase

When reading the code, trace one request end to end: frontend page → API helper → route → middleware → controller → service → repository → MySQL. Then trace the response back to the page. For business actions, understand the service and its transaction before editing it.
