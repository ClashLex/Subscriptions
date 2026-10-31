/** Live API/database check for overlapping billing and payment requests. Use a local test database. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mysql from "mysql2/promise";

if (process.env.NODE_ENV === "production") throw new Error("Concurrency fixtures are disabled in production.");
assert.ok(process.env.SEED_ADMIN_EMAIL && process.env.SEED_ADMIN_PASSWORD, "Seed Admin credentials are required.");

const base = `http://127.0.0.1:${process.env.PORT ?? 4000}/api/v1`;
const marker = randomUUID().slice(0, 12);
const today = new Date().toISOString().slice(0, 10);

async function post(path, body, cookie) {
  const response = await fetch(`${base}/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  return { status: response.status, data: json.data, error: json.error, cookie: response.headers.getSetCookie()[0]?.split(";")[0] };
}

function expectStatus(response, status, context) {
  assert.equal(response.status, status, `${context}: ${JSON.stringify(response.error)}`);
  return response.data;
}

function money(cents) {
  return `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;
}

const customer = expectStatus(await post("auth/register", {
  email: `concurrent.${marker}@brightloop.test`, password: "Concurrency-Pass1!",
}), 201, "Register customer").user;
const login = await post("auth/login", {
  email: process.env.SEED_ADMIN_EMAIL, password: process.env.SEED_ADMIN_PASSWORD,
});
expectStatus(login, 200, "Admin login");
assert.ok(login.cookie, "Admin session cookie missing.");
const cookie = login.cookie;
const product = expectStatus(await post("products", {
  name: `Concurrency product ${marker}`, type: "Service", salesPrice: "100.00", costPrice: "0.00",
}, cookie), 201, "Create product");
const plan = expectStatus(await post("plans", {
  name: `Concurrency plan ${marker}`, price: "999.00", billingIntervalUnit: "MONTH",
  billingIntervalCount: 1, minimumQuantity: 1, availableFrom: "2020-01-01", availableUntil: "2099-12-31",
}, cookie), 201, "Create plan");

async function activate() {
  const subscription = expectStatus(await post("subscriptions", {
    customerId: customer.id, planId: plan.id, startDate: today,
    lines: [{ productId: product.id, quantity: 1 }],
  }, cookie), 201, "Create subscription");
  for (const action of ["quotation", "confirm", "activate"]) {
    expectStatus(await post(`subscriptions/${subscription.id}/${action}`, {}, cookie), 200, `${action} subscription`);
  }
  return subscription.id;
}

const connection = await mysql.createConnection({
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT ?? 3306),
  database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
});
try {
  const subscriptionId = await activate();
  const runs = await Promise.all(Array.from({ length: 4 }, () => post("billing/run", {}, cookie)));
  for (const [index, run] of runs.entries()) {
    expectStatus(run, 200, `Concurrent billing run ${index + 1}`);
    assert.ok(!run.data.failed.some((row) => row.subscriptionId === subscriptionId), "A concurrent billing attempt failed.");
  }
  const [invoiceRows] = await connection.query(
    "SELECT id, status, grand_total FROM invoices WHERE subscription_id = ?",
    [subscriptionId],
  );
  assert.equal(invoiceRows.length, 1, "Concurrent billing created duplicate invoice rows.");
  const invoiceId = invoiceRows[0].id;
  const reported = runs.flatMap((run) => run.data.invoices).filter((row) => row.subscriptionId === subscriptionId);
  assert.equal(reported.length, 1, "The same invoice was reported as created more than once.");
  const confirmed = expectStatus(await post(`invoices/${invoiceId}/confirm`, {}, cookie), 200, "Confirm invoice");
  const fullAmount = confirmed.grandTotal;
  const paymentAttempts = await Promise.all(Array.from({ length: 2 }, (_, index) => post(
    `invoices/${invoiceId}/payments`, { method: "test", amount: fullAmount, reference: `full-${marker}-${index}` }, cookie,
  )));
  assert.deepEqual(paymentAttempts.map((response) => response.status).sort(), [201, 409], "Exactly one full payment should succeed.");
  const [paidRows] = await connection.query(
    "SELECT i.status, COUNT(p.id) AS payment_count, COALESCE(SUM(p.amount), 0) AS paid FROM invoices i LEFT JOIN payments p ON p.invoice_id = i.id WHERE i.id = ? GROUP BY i.id",
    [invoiceId],
  );
  assert.equal(paidRows[0].status, "PAID");
  assert.equal(paidRows[0].payment_count, 1);
  assert.equal(Number(paidRows[0].paid), Number(fullAmount));
  console.log("Four overlapping billing runs created one invoice; one of two simultaneous full payments succeeded.");

  const secondId = await activate();
  const nextRun = expectStatus(await post("billing/run", {}, cookie), 200, "Bill second subscription");
  const secondInvoice = nextRun.invoices.find((row) => row.subscriptionId === secondId);
  assert.ok(secondInvoice, "Second subscription was not billed.");
  const second = expectStatus(await post(`invoices/${secondInvoice.invoiceId}/confirm`, {}, cookie), 200, "Confirm second invoice");
  const totalCents = BigInt(second.grandTotal.replace(".", ""));
  assert.ok(totalCents >= 2n, "Second invoice must support two positive payments.");
  const halfCents = totalCents / 2n;
  const halves = await Promise.all([halfCents, totalCents - halfCents].map((amount, index) => post(
    `invoices/${secondInvoice.invoiceId}/payments`,
    { method: "test", amount: money(amount), reference: `half-${marker}-${index}` }, cookie,
  )));
  assert.deepEqual(halves.map((response) => response.status), [201, 201], "Both valid partial payments should succeed.");
  const [splitRows] = await connection.query(
    "SELECT i.status, COUNT(p.id) AS payment_count, COALESCE(SUM(p.amount), 0) AS paid FROM invoices i LEFT JOIN payments p ON p.invoice_id = i.id WHERE i.id = ? GROUP BY i.id",
    [secondInvoice.invoiceId],
  );
  assert.equal(splitRows[0].status, "PAID");
  assert.equal(splitRows[0].payment_count, 2);
  assert.equal(Number(splitRows[0].paid), Number(second.grandTotal));
  console.log("Two simultaneous partial payments settled the second invoice exactly.");
} finally {
  await connection.end();
}
