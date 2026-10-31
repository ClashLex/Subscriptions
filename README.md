# Subscriptions — Project Documentation

> **Documentation update rule:** After every completed implementation step, update this file before beginning the next step. Change only information verified against the current code, database, tests, or running UI. Record the date, step completed, resulting behaviour, and any deviation or unresolved issue. Update `CHANGELOG.md` at the same time. Never mark an unimplemented or untested item as complete.

## Project summary

**Subscriptions** is a subscription and recurring-revenue management application being built for the Make-A-Ton 9.0 problem statement for the fictional company Brightloop Software. It is intended to bring product and plan configuration, customer subscriptions, recurring invoices, discounts, taxes, payments, and finance reporting into one system.

**Product subtitle:** Subscription & Recurring Revenue Management  
**Tagline:** Every subscription. Every cycle. Under control.

This is an independent hackathon implementation. It is not an official Odoo product or an Odoo-branded application.

## Start here

Read these documents in order when you are new to the project:

1. `REQUIREMENTS.md` — what the challenge explicitly asks for.
2. `BUSINESS_WORKFLOWS.md` — how a customer, subscription, invoice, and payment move through the system.
3. `ARCHITECTURE.md` — how the browser, API, backend services, and database connect.
4. `DATA_MODEL.md` — the entities and relationships that store the business data.
5. `BILLING_AND_FINANCE.md` — recurring billing, invoices, taxes, discounts, payments, and reporting rules.
6. `SECURITY_AND_ACCESS.md` — authentication, roles, and customer data boundaries.
7. `API_CONTRACT.md` and `UI_UX_SPEC.md` — how the frontend and backend should communicate and what each user sees.
8. `IMPLEMENTATION_PLAN.md` — the recommended build order and completion criteria.
9. `TEST_PLAN.md` — how to verify the implementation.
10. `DEVELOPMENT_GUIDE.md` and `DEPLOYMENT_AND_DEMO.md` — how to run, configure, and demonstrate it.
11. `DEVELOPMENT_BLUEPRINT.md` — the earlier detailed technical blueprint with setup commands, code patterns, and extended guidance.

## Source of truth and decision hierarchy

Use this order when documents or code disagree:

1. The supplied `Subscription_Management_System.pdf` is the source for the challenge's functional requirements. It is not bundled here because this ZIP contains Markdown documentation.
2. A later, explicit decision recorded in this documentation and `CHANGELOG.md` controls implementation choices that the challenge does not specify.
3. The code, migrations, and tests describe what is currently implemented. Documentation must be brought into line with verified code after each implementation step.
4. `DEVELOPMENT_BLUEPRINT.md` is the earlier detailed reference. Its suggestions are not automatically organizer requirements.

Keep requirements separate from recommended design decisions. Where the challenge leaves behaviour unspecified, document the choice as a project decision rather than presenting it as a mandatory challenge rule.

## Recommended technology baseline

- Frontend: React, TypeScript, Vite, Tailwind CSS.
- Backend: Node.js, Express, TypeScript.
- Database: MySQL 8.4 with InnoDB.
- Data access: `mysql2/promise`, parameterized SQL, and a shared connection pool.
- Validation: Zod at API boundaries, with database constraints for critical invariants.
- Authentication: server-side sessions with secure HTTP-only cookies; Argon2id password hashes.
- Architecture: one modular monolith, not microservices.

Use the exact installed runtime and package versions in the repository's lockfiles. Check current official documentation if setup commands or major versions have changed.

## Core end-to-end outcome

The main demonstrable flow should work without manually editing database rows:

```text
Admin creates product and plan
          ↓
Customer account is registered / created
          ↓
Subscription is drafted and confirmed
          ↓
Subscription becomes active and reaches a billing date
          ↓
Billing service creates one invoice for that period
          ↓
Tax and eligible discount are calculated
          ↓
Staff records payment against the invoice
          ↓
Invoice balance and finance dashboard update
```

## Project status

This documentation package is an initial planning baseline. It does **not** mean that the application features have already been implemented. Keep the checklists in `IMPLEMENTATION_PLAN.md` and `TEST_PLAN.md` accurate as development progresses.

## Repository documentation convention

This pack uses one fixed location: the project README lives at the repository root, and all other documentation files live in a root `docs/` directory. Do not maintain duplicate copies that drift apart. Keep documentation tracked in Git (do not ignore it), so each implementation step can update docs and `CHANGELOG.md` in the same commit.
