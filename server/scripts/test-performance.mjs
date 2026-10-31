/** Local API benchmark with 3,000 temporary subscriptions and invoices. Requires a running API and MySQL. */
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import mysql from "mysql2/promise";

if (process.env.NODE_ENV === "production") throw new Error("Performance fixtures are disabled in production.");

const count = 3_000;
const paidCount = count / 2;
const prefix = `PF${Date.now().toString(36)}`;
const today = new Date().toISOString().slice(0, 10);
const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
const now = new Date().toISOString().slice(0, 19).replace("T", " ");
const base = `http://127.0.0.1:${process.env.PORT ?? 4000}/api/v1`;
const connection = await mysql.createConnection({
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT ?? 3306),
  database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  dateStrings: true, decimalNumbers: false,
});
let planId = null;
let committed = false;

async function api(path, cookie) {
  const response = await fetch(`${base}${path}`, { headers: { cookie } });
  if (response.status !== 200) throw new Error(`${path}: ${response.status} ${await response.text()}`);
  return (await response.json()).data;
}

function cents(value) {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}

function currency(summary) {
  return summary.currencies.find((row) => row.currencyCode === "INR") ?? {
    invoiced: "0.00", received: "0.00", outstanding: "0.00", overdue: "0.00",
  };
}

async function measure(path, cookie) {
  const times = [];
  for (let index = 0; index < 20; index += 1) {
    const start = performance.now();
    await api(path, cookie);
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return { p95: times[18], max: times[19] };
}

try {
  assert.ok(process.env.SEED_ADMIN_EMAIL && process.env.SEED_ADMIN_PASSWORD, "Seed Admin credentials are required.");
  const login = await fetch(`${base}/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: process.env.SEED_ADMIN_EMAIL, password: process.env.SEED_ADMIN_PASSWORD }),
  });
  assert.equal(login.status, 200, "Admin login failed.");
  const cookie = login.headers.getSetCookie()[0]?.split(";")[0];
  assert.ok(cookie, "Admin session cookie missing.");
  const summaryPath = `/finance/summary?from=${yesterday}&to=${today}`;
  const before = await api(summaryPath, cookie);

  await connection.beginTransaction();
  const [users] = await connection.query("SELECT id FROM users WHERE email = ? LIMIT 1", [process.env.SEED_ADMIN_EMAIL]);
  const userId = users[0]?.id;
  assert.ok(userId, "Seed Admin user missing.");
  const [plan] = await connection.query("INSERT INTO plans (name, price) VALUES (?, '0.00')", [`${prefix} performance plan`]);
  planId = plan.insertId;
  const subscriptions = Array.from({ length: count }, (_, index) => [
    `${prefix}S${index}`, userId, planId, "ACTIVE", yesterday, Number(yesterday.slice(8, 10)),
  ]);
  await connection.query(
    `INSERT INTO subscriptions (subscription_number, customer_id, plan_id, status, start_date, billing_anchor_day)
     VALUES ${subscriptions.map(() => "(?, ?, ?, ?, ?, ?)").join(",")}`,
    subscriptions.flat(),
  );
  const [subscriptionRows] = await connection.query(
    "SELECT id, subscription_number FROM subscriptions WHERE subscription_number LIKE ?",
    [`${prefix}S%`],
  );
  assert.equal(subscriptionRows.length, count);
  const invoices = subscriptionRows.map((row) => [
    `${prefix}I${row.subscription_number.slice((`${prefix}S`).length)}`,
    row.id, userId, yesterday, today, yesterday, yesterday, "INR",
    "100.00", "100.00", "CONFIRMED", `${yesterday} 00:00:00`,
  ]);
  await connection.query(
    `INSERT INTO invoices (invoice_number, subscription_id, customer_id, period_start, period_end,
      issue_date, due_date, currency_code, subtotal, grand_total, status, confirmed_at)
     VALUES ${invoices.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(",")}`,
    invoices.flat(),
  );
  const [invoiceRows] = await connection.query("SELECT id FROM invoices WHERE invoice_number LIKE ? ORDER BY id LIMIT ?", [`${prefix}I%`, paidCount]);
  const payments = invoiceRows.map((row) => [row.id, "test", "50.00", now, "SUCCESSFUL", userId]);
  await connection.query(
    `INSERT INTO payments (invoice_id, method, amount, paid_at, status, recorded_by)
     VALUES ${payments.map(() => "(?, ?, ?, ?, ?, ?)").join(",")}`,
    payments.flat(),
  );
  await connection.commit();
  committed = true;

  const after = await api(summaryPath, cookie);
  assert.equal(after.activeSubscriptions - before.activeSubscriptions, count);
  const beforeInr = currency(before);
  const afterInr = currency(after);
  for (const [field, expected] of [["invoiced", BigInt(count) * 10_000n], ["received", BigInt(paidCount) * 5_000n], ["outstanding", BigInt(count) * 10_000n - BigInt(paidCount) * 5_000n], ["overdue", BigInt(count) * 10_000n - BigInt(paidCount) * 5_000n]]) {
    assert.equal(cents(afterInr[field]) - cents(beforeInr[field]), expected, `${field} changed unexpectedly`);
  }
  const paths = [summaryPath, "/subscriptions?page=1&pageSize=25", "/invoices?page=1&pageSize=25", "/payments?page=1&pageSize=25"];
  for (const path of paths) {
    const result = await measure(path, cookie);
    console.log(`${path}: p95=${result.p95.toFixed(1)}ms max=${result.max.toFixed(1)}ms with ${count} fixture invoices`);
    assert.ok(result.p95 < 2_000, `${path} p95 exceeded 2 seconds`);
  }
  const [planRows] = await connection.query(
    `EXPLAIN FORMAT=JSON SELECT i.id FROM invoices i
     WHERE i.status IN ('CONFIRMED', 'PAID') AND i.due_date < ? ORDER BY i.id DESC LIMIT 25`,
    [today],
  );
  assert.ok(planRows[0]?.EXPLAIN, "MySQL did not return an execution plan.");
  console.log("MySQL EXPLAIN plan for overdue invoice lookup returned successfully.");
  console.log("Performance and finance-delta checks passed.");
} finally {
  try {
    if (!committed) {
      await connection.rollback();
    } else {
      await connection.beginTransaction();
      await connection.query("DELETE FROM payments WHERE invoice_id IN (SELECT id FROM invoices WHERE invoice_number LIKE ?)", [`${prefix}I%`]);
      await connection.query("DELETE FROM invoices WHERE invoice_number LIKE ?", [`${prefix}I%`]);
      await connection.query("DELETE FROM subscriptions WHERE subscription_number LIKE ?", [`${prefix}S%`]);
      if (planId !== null) await connection.query("DELETE FROM plans WHERE id = ?", [planId]);
      await connection.commit();
    }
  } catch (error) {
    await connection.rollback();
    console.error(`Performance fixture cleanup failed for prefix ${prefix}:`, error);
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}
