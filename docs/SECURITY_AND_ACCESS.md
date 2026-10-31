# Security, Authentication, and Role Access

> **Documentation update rule:** After every completed implementation step, update this file before beginning the next step. Change only information verified against the current code, database, tests, or running UI. Record the date, step completed, resulting behaviour, and any deviation or unresolved issue. Update `CHANGELOG.md` at the same time. Never mark an unimplemented or untested item as complete.

## 1. Security goals

- Only authenticated users can access protected business functions.
- Admin, Staff, and Customer permissions are enforced by the backend.
- Customers can access only their own subscriptions, invoices, and payment history.
- Passwords and reset tokens are never stored in plaintext.
- Financial calculations and lifecycle transitions cannot be changed by editing browser requests.

## 2. Password and account rules

The challenge requires a password longer than eight characters, containing uppercase, lowercase, and a special character. Validate this on registration and password reset. Normalize email (trim whitespace and apply the chosen case-normalization policy) before checking the unique database constraint. Use Argon2id for password hashing. Never log passwords.

## 3. Authentication sessions

Recommended baseline: server-side sessions stored in MySQL.

- Use a cryptographically secure session secret from environment configuration.
- Set cookies `HttpOnly`, `Secure` in HTTPS deployment, and an appropriate `SameSite` value.
- Do not use in-memory session storage for a deployed application.
- Regenerate the session ID after login and privilege changes.
- Destroy the session at logout.
- Set sensible idle and absolute expiry.
- Consider revoking sessions after password reset or account deactivation.
- Configure CORS to allow only the known frontend origin; do not combine wildcard origins with credentialed cookies.

If the architecture later changes to JWTs, document the threat model and storage strategy. Do not mix session and JWT approaches casually.

## 4. Password reset

1. Generate a cryptographically random, high-entropy token.
2. Store only a secure hash of the token, linked to the user and expiry.
3. Send a reset URL to the registered address.
4. Return a generic response whether or not the email exists.
5. Rate-limit requests by IP and email identifier.
6. Validate token hash, unused state, and expiry on reset.
7. Mark token used and update password hash in one transaction.
8. Invalidate other outstanding reset tokens and consider revoking existing sessions.

Never include the raw token in application logs or analytics. Local console output may be used temporarily during development but must not be treated as completed email behaviour.

## 5. Role and permission matrix

| Capability | Admin | Internal Staff | Customer |
|---|---:|---:|---:|
| Manage all users | Yes | No | No |
| Create staff accounts | Yes | No | No |
| Configure products, variants, plans, taxes, discounts | Yes | No by default | No |
| View all subscriptions/invoices | Yes | Operational access | No |
| Create quotations/subscriptions | Yes | Yes | Optional self-service only |
| Confirm/activate/close subscriptions | Yes | Yes within policy | Request-only by default |
| Run billing | Yes | No by default | No |
| Record payments | Yes | Yes | No by default |
| View own subscriptions/invoices/payments | Yes | As operationally needed | Yes |
| View finance dashboard | Yes | Limited operational dashboard | No |

The challenge does not define every individual permission. This matrix is the recommended starting policy. Any deviation must be recorded in `CHANGELOG.md`.

## 6. Authorization implementation

- Resolve the user and role from the server-side session.
- Use reusable middleware such as `requireAuth`, `requireRole`, and resource ownership checks.
- Enforce Admin-only actions on the backend even if the button is hidden in the frontend.
- For customer resources, include the authenticated customer ID in SQL predicates.
- Check ownership for every identifier-based read and write, including invoices, payments, and downloads.
- Prefer returning 404 for resources outside the current user's scope if revealing their existence would leak information.

## 7. Input and application security

- Validate every request with runtime schemas.
- Use parameterized SQL.
- Use Helmet and appropriate security headers.
- Apply rate limiting to login, registration, and password reset.
- Use HTTPS outside local development.
- Configure CORS for the actual client origin only.
- Protect state-changing cookie-authenticated requests against CSRF using an appropriate strategy.
- Keep secrets in environment variables or a secret manager; commit only `.env.example`.
- Avoid collecting or storing payment card numbers.
- Escape/sanitize untrusted text when rendering HTML or email templates.
- Keep dependencies updated and inspect security advisories before release.

## 8. Audit logging

Audit privileged actions such as staff creation, price/plan/tax/discount changes, subscription state changes, invoice cancellation, and manual payment entries. Store actor, action, entity, timestamp, and non-sensitive context. Do not put passwords, session IDs, reset tokens, or secrets in audit metadata.

## 9. Security test checklist

- [ ] Anonymous request to a protected endpoint returns 401.
- [ ] Staff cannot create another staff account.
- [ ] Customer cannot access another customer's records by guessing IDs.
- [ ] Customer cannot update a price, role, status, or customer ID by altering request JSON.
- [ ] SQL injection strings are treated as values, not executable SQL.
- [ ] Weak passwords are rejected.
- [ ] Reset tokens expire and cannot be reused.
- [ ] Login/reset endpoints are rate limited.
- [ ] Session cookie flags are correct in the deployed environment.
- [ ] Secrets and sensitive data are absent from logs and repository history.
