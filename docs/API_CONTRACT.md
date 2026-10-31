# REST API Contract

> **Documentation update rule:** After every completed implementation step, update this file before beginning the next step. Change only information verified against the current code, database, tests, or running UI. Record the date, step completed, resulting behaviour, and any deviation or unresolved issue. Update `CHANGELOG.md` at the same time. Never mark an unimplemented or untested item as complete.

## 1. API conventions

- Base path: `/api/v1`
- Content type: `application/json`
- Authentication: server-side session cookie.
- Monetary values: decimal strings or integer minor units, never JavaScript floating-point numbers.

### Response envelope

Success response (example):

```json
{
  "data": { "id": 123, "status": "ACTIVE" }
}
```

Error response (example):

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Please correct the highlighted fields.",
    "details": [{ "field": "email", "message": "Enter a valid email address." }]
  }
}
```

Do not expose stack traces, SQL statements, password hashes, session IDs, or secrets in API responses.
Paginated list responses also include `meta` with `page`, `pageSize`, `total`, and `totalPages`.

## 2. HTTP status conventions

- `200` successful read/update/action.
- `201` resource created.
- `204` successful action with no response body.
- `400` malformed request or invalid state transition.
- `401` unauthenticated.
- `403` authenticated but not permitted.
- `404` resource absent or intentionally concealed due to ownership rules.
- `409` duplicate/conflict, such as duplicate email or an already-created invoice period.
- `422` well-formed request with domain validation failure, if this distinction is adopted consistently.
- `429` rate limit.
- `500` unexpected server error.

Choose a consistent 400/422 strategy and use it throughout the API.

## 3. Endpoint map

All endpoints below are proposed API design, not routes mandated by the challenge. Apply authentication and authorization middleware consistently.

### Authentication and users

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/auth/register` | Public | Customer registration. |
| POST | `/auth/login` | Public | Create session. |
| POST | `/auth/logout` | Authenticated | Destroy session. |
| GET | `/auth/me` | Authenticated | Return current user and permitted profile fields. |
| POST | `/auth/forgot-password` | Public, rate limited | Request reset link. |
| POST | `/auth/reset-password` | Public, token validated | Set new password. |
| GET | `/users` | Admin | List/filter users. |
| POST | `/users/staff` | Admin | Create staff account. |
| PATCH | `/users/:id/status` | Admin | Activate/deactivate account. |

### Products, taxes, plans, discounts

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET/POST | `/products` | Admin for writes; staff/customer reads only if needed | List/create products. |
| GET/PATCH | `/products/:id` | Admin for writes | Read/update product. |
| POST | `/products/:id/variants` | Admin | Add variant. |
| GET/POST | `/taxes` | Admin for writes | List/create tax rules. |
| PATCH | `/taxes/:id` | Admin | Update tax rule. |
| GET/POST | `/plans` | Authenticated reads according to visibility; Admin writes | List/create plans. |
| GET/PATCH | `/plans/:id` | Authenticated reads; Admin writes | Read/update plan. |
| GET | `/discounts` | Staff/Admin | List active rules; Admin may include inactive rules. |
| POST | `/discounts` | Admin | Create a discount rule. |
| PATCH | `/discounts/:id` | Admin | Update/deactivate discount. |

### Quotations and subscriptions

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET/POST | `/quotation-templates` | Staff/Admin | List/create templates. |
| GET/PATCH | `/quotation-templates/:id` | Staff/Admin | Read/update template. |
| GET | `/subscriptions` | Admin/Staff; customers own records only | Paginated, filtered list. |
| POST | `/subscriptions` | Admin/Staff; customer self-service only if explicitly implemented | Create draft. |
| GET | `/subscriptions/:id` | Admin/Staff or owning customer | Read details and lines. |
| PATCH | `/subscriptions/:id` | Authorized Admin/Staff | Update allowed draft/quotation fields. |
| POST | `/subscriptions/:id/quotation` | Admin/Staff | Submit as quotation and set validity. |
| POST | `/subscriptions/:id/confirm` | Admin/Staff | Confirm quotation. |
| POST | `/subscriptions/:id/activate` | Admin/Staff or lifecycle service | Activate on permitted date. |
| POST | `/subscriptions/:id/pause` | Admin/Staff or permitted owner action | Pause if plan allows. |
| POST | `/subscriptions/:id/resume` | Admin/Staff or permitted owner action | Resume if paused. |
| POST | `/subscriptions/:id/close` | Admin/Staff or permitted owner request | Close under plan rules. |
| POST | `/subscriptions/:id/renew` | Admin/Staff | Create linked renewal. |

### Billing, invoices, payments, reporting

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/billing/run` | Admin | Trigger due-invoice generation. |
| GET | `/invoices` | Admin/Staff; customer own only | Filtered/paginated invoice list. |
| GET | `/invoices/:id` | Admin/Staff or owning customer | Invoice detail and payment summary. |
| POST | `/invoices/:id/confirm` | Admin/Staff | Confirm draft invoice. |
| POST | `/invoices/:id/cancel` | Admin/Staff | Cancel under policy. |
| POST | `/invoices/:id/send` | Admin/Staff | Send invoice email. |
| GET | `/invoices/:id/print` | Admin/Staff or owning customer | Download/print invoice PDF. |
| POST | `/invoices/:id/payments` | Admin/Staff | Record payment. |
| GET | `/payments` | Admin/Staff; customer own only | Filter payments. |
| GET | `/dashboard/summary` | Admin/Staff | KPI summary with date filters. |
| GET | `/dashboard/revenue-series` | Admin/Staff | Time-series revenue data. |
| GET | `/health` | Public or internal-only | Liveness/readiness, without secrets. |

`POST /billing/run` access as shown is the recommended base policy. The challenge permits staff billing only if it is explicitly granted; if that permission is extended to Staff, update this table in the same commit and record the exception in `CHANGELOG.md`.

Implemented Phase 5 routes include the manual billing trigger, discount CRUD, invoice list/detail/confirm/cancel, payment list/recording, and customer ownership checks for invoice/payment reads. The optional scheduler invokes the billing service internally; it has no HTTP route. Invoice email/PDF and dashboard routes remain planned.

## 4. Pagination and filtering

For collections, support a consistent pattern such as:

`GET /subscriptions?page=1&pageSize=25&status=ACTIVE&search=brightloop&sortBy=createdAt&sortOrder=desc`

Rules:

- Apply a maximum `pageSize` (for example 100).
- Validate page numbers and filter values.
- Allowlist sort keys; never interpolate an arbitrary request value as a SQL column name.
- Return `total`, `page`, `pageSize`, and optionally `totalPages` in metadata.
- Prefer indexed server-side filters to fetching the entire table into React.

## 5. Request validation

Validate all body, path, and query inputs with Zod at the API boundary. The backend must recalculate prices, discounts, tax, and totals. Ignore or reject client-submitted totals and role fields. Use explicit DTO schemas for create/update requests rather than accepting entire database rows.

## 6. Idempotency and concurrency

`POST /billing/run` must call the idempotent billing service. Repeating it should not duplicate invoice periods. If a request is retried after a network timeout, the unique database period constraint still prevents duplicate records. Payment creation should also support a request idempotency key if duplicate submission risk is material.

## 7. Ownership checks

Never take a customer ID from a customer-facing request as proof of ownership. Derive the customer identity from the authenticated session, then query only resources belonging to that customer. Verify ownership for nested routes such as `/invoices/:id/payments` before returning or mutating anything.

## 8. API documentation upkeep

When a route, request DTO, response, status code, permission, or error code changes, update this file and the corresponding frontend API types in the same implementation step. Add/adjust an API test for the change.
