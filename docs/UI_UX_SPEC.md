# UI and User Experience Specification

> **Documentation update rule:** After every completed implementation step, update this file before beginning the next step. Change only information verified against the current code, database, tests, or running UI. Record the date, step completed, resulting behaviour, and any deviation or unresolved issue. Update `CHANGELOG.md` at the same time. Never mark an unimplemented or untested item as complete.

## 1. Product identity and visual direction

Product name: **Subscriptions**  
Subtitle: **Subscription & Recurring Revenue Management**  
Tagline: **Every subscription. Every cycle. Under control.**

The application should feel like a focused business management tool: clear hierarchy, precise tables, readable financial values, useful filters, and consistent status indicators. Avoid generic marketing-site layouts inside the authenticated application. Prioritize information density without crowding.

This is an independent hackathon application; do not imply it is an official Odoo module.

## 2. Application shell

Authenticated pages should share:

- Sidebar with role-appropriate navigation.
- Top bar showing current user and logout.
- Page title and optional breadcrumb.
- Main content area.
- Consistent content width, spacing, typography, and action placement.

Navigation visibility is a UX convenience only. The backend must still enforce permissions.

## 3. Role-specific navigation

### Admin

- Overview / Finance dashboard
- Products and variants
- Plans
- Quotations / templates
- Subscriptions
- Invoices
- Payments
- Taxes
- Discounts
- Users / Staff
- Settings / Audit history (if implemented)

### Internal Staff

- Work dashboard
- Customers
- Quotations
- Subscriptions
- Invoices
- Payments

Keep configuration tools such as taxes and discount rule management hidden and inaccessible unless explicitly granted.

### Customer portal

- Overview
- My subscriptions
- My invoices
- Payment history
- Account/profile

Customer pages must show only the authenticated customer's records.

## 4. Key screens

### Dashboard

Show active subscriptions, cash received, outstanding balance, overdue invoices, and a revenue trend/summary. Provide date filters. Use labels that distinguish collected payments from invoiced amounts.

### Product list and editor

Display product name, type, sales price, active state, and variant count. The editor handles name, type, sales price, cost price, notes, and variants. Hide cost price from roles that do not need it.

### Plan list and editor

Display name, price, frequency, minimum quantity, availability, and lifecycle permissions. Use explicit controls for daily/weekly/monthly/yearly recurrence, pause, early close, auto-close, and renew.

### Quotation template editor

Select default plan, product lines, quantities, prices, taxes, and validity duration. Clearly indicate that generated quotations inherit a snapshot and can expire.

### Subscription list and detail

List number, customer, plan, start date, next billing date, end/expiry date, and status. Filters should include status, customer, plan, and date range. Detail view should show line items, agreed prices, billing timeline, events, and allowed actions.

### Invoice list and detail

List invoice number, customer, issue date, due date, total, paid amount, outstanding balance, and status. Detail view includes immutable line snapshots, taxes, discount, totals, payment history, and confirm/cancel/send/print actions.

### Payments

Display payment date, invoice number, customer, method, amount, and reference/note. Provide filters by date, method, and invoice.

### Customer portal

Make it simpler than the admin interface. A customer should immediately understand current subscription status, next billing date, current invoices, paid/unpaid balances, and payment history.

## 5. Reusable components

Build shared components where repeated patterns exist:

- `AppShell`, `Sidebar`, `Topbar`, `PageHeader`
- `DataTable`, `Pagination`, `SearchFilterBar`
- `StatusBadge`, `EmptyState`, `LoadingState`, `ErrorState`
- `FormField`, `MoneyDisplay`, `DateDisplay`
- `ConfirmDialog`, `InvoiceTotals`, `PaymentForm`

Do not create a large design system before a working page exists. Extract components when reuse is clear.

## 6. Interaction and feedback rules

- Every form shows field-level validation errors.
- Every list has loading, error, and empty states.
- Disable submit buttons while requests are pending.
- Confirm irreversible actions such as cancellation and closure.
- After a mutation, refresh or update the relevant query/cache.
- Show success/failure messages with a clear next action.
- Use consistent date, currency, and decimal formatting.
- Make tables usable on narrow screens with horizontal scrolling or a deliberate stacked layout.
- Do not rely on color alone to communicate status; include text.

## 7. Accessibility and responsiveness

- Use semantic buttons, labels, headings, and table markup.
- Ensure keyboard navigation and visible focus indicators.
- Maintain sufficient text contrast.
- Associate errors with their input fields.
- Avoid tiny text in dense tables.
- Test at desktop, tablet, and mobile widths.

## 8. UI completion checklist

- [ ] Role-appropriate navigation is present.
- [ ] Every primary screen has loading/error/empty states.
- [ ] Forms validate and display backend errors.
- [ ] Financial values use consistent formatting.
- [ ] Status badges include readable labels.
- [ ] Destructive actions require confirmation.
- [ ] Tables support filtering and pagination.
- [ ] Customer portal data is scoped correctly.
- [ ] Layout remains usable on a narrow viewport.
