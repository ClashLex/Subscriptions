/** Production must not expose password-reset tokens when SMTP is absent. */
import assert from "node:assert/strict";

process.env.NODE_ENV = "production";
process.env.DB_HOST ??= "127.0.0.1";
process.env.DB_NAME ??= "unit_test";
process.env.DB_USER ??= "unit_test";
process.env.DB_PASSWORD ??= "unit-test-db-password";
process.env.SESSION_SECRET ??= "unit-test-session-secret-at-least-32-chars";
process.env.SMTP_HOST = "";
process.env.SMTP_PORT = "";
process.env.SMTP_USER = "";
process.env.SMTP_PASSWORD = "";
process.env.MAIL_FROM = "";

const messages = [];
const originalError = console.error;
console.error = (...args) => { messages.push(args); };
try {
  const { sendPasswordResetEmail } = await import("../dist/src/lib/email.js");
  messages.length = 0;
  const result = await sendPasswordResetEmail("recipient@example.test", "private-reset-token");
  assert.deepEqual(result, { delivered: false });
  assert.equal(messages.length, 0, "Production logged a password-reset token without SMTP.");
  console.log("Production password-reset fallback does not log tokens or return a link.");
} finally {
  console.error = originalError;
}
