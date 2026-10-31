import assert from "node:assert/strict";
import { SMTPServer } from "smtp-server";

process.env.DB_HOST ??= "127.0.0.1";
process.env.DB_NAME ??= "unit_test";
process.env.DB_USER ??= "unit_test";
process.env.DB_PASSWORD ??= "unit-test-db-password";
process.env.SESSION_SECRET ??= "unit-test-session-secret-at-least-32-chars";

const captured = [];
const smtp = new SMTPServer({
  authOptional: true,
  disabledCommands: ["STARTTLS"],
  onData(stream, session, callback) {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => {
      captured.push({
        to: session.envelope.rcptTo.map((recipient) => recipient.address),
        raw: Buffer.concat(chunks).toString("utf8"),
      });
      callback(null, "Message captured");
    });
    stream.on("error", callback);
  },
});

await new Promise((resolve) => smtp.listen(0, "127.0.0.1", resolve));
try {
  const address = smtp.server.address();
  assert.ok(address && typeof address !== "string");
  process.env.SMTP_HOST = "127.0.0.1";
  process.env.SMTP_PORT = String(address.port);
  process.env.MAIL_FROM = "invoices@example.test";
  process.env.APP_URL = "http://127.0.0.1:5173";
  const { sendInvoiceEmail, sendPasswordResetEmail } = await import("../dist/src/lib/email.js");
  const delivered = await sendInvoiceEmail({
    to: "customer@example.test", invoiceId: 42, invoiceNumber: "INV-000042",
    currencyCode: "INR", grandTotal: "123.45", dueDate: "2026-11-15", status: "CONFIRMED",
  });
  assert.equal(delivered, true);
  assert.equal(captured.length, 1);
  assert.deepEqual(captured[0].to, ["customer@example.test"]);
  const body = captured[0].raw.replace(/=\r?\n/g, "").replace(/=3D/g, "=");
  assert.match(body, /INV-000042/);
  assert.match(body, /INR 123\.45/);
  assert.match(body, /\/portal\?tab=invoices&open=42/);
  const reset = await sendPasswordResetEmail("customer@example.test", "a".repeat(64));
  assert.equal(reset.delivered, true);
  assert.equal(reset.devUrl, undefined);
  assert.equal(captured.length, 2);
  assert.deepEqual(captured[1].to, ["customer@example.test"]);
  const resetBody = captured[1].raw.replace(/=\r?\n/g, "").replace(/=3D/g, "=");
  assert.match(resetBody, /\/reset-password\?token=/);
  console.log("Invoice and password reset SMTP capture checks passed locally.");
} finally {
  await new Promise((resolve) => smtp.close(resolve));
}
