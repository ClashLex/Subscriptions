/** Starts a real API scheduler and waits for it to invoice one local fixture. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import mysql from "mysql2/promise";

if (process.env.NODE_ENV === "production") throw new Error("Scheduler fixtures are disabled in production.");
assert.ok(process.env.SEED_ADMIN_EMAIL && process.env.SEED_ADMIN_PASSWORD, "Seed Admin credentials are required.");

const listener = createServer();
await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
const address = listener.address();
assert.ok(address && typeof address !== "string");
const port = address.port;
await new Promise((resolve) => listener.close(resolve));

const base = `http://127.0.0.1:${port}/api/v1`;
const marker = randomUUID().slice(0, 12);
const today = new Date().toISOString().slice(0, 10);
const child = spawn(process.execPath, ["dist/src/server.js"], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(port), NODE_ENV: "test", BILLING_RUN_INTERVAL_MINUTES: "1" },
  stdio: ["ignore", "pipe", "pipe"],
});
let childOutput = "";
child.stdout.on("data", (chunk) => { childOutput += chunk.toString(); });
child.stderr.on("data", (chunk) => { childOutput += chunk.toString(); });
let connection;

async function post(path, body, cookie) {
  const response = await fetch(`${base}/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  assert.equal(response.status, path === "auth/login" ? 200 : 201, `${path}: ${JSON.stringify(json.error)}`);
  return { data: json.data, cookie: response.headers.getSetCookie()[0]?.split(";")[0] };
}

async function waitFor(check, timeoutMs, description) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Scheduler API exited early with code ${child.exitCode}: ${childOutput}`);
    const result = await check();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`Timed out waiting for ${description}. Scheduler output: ${childOutput}`);
}

try {
  connection = await mysql.createConnection({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT ?? 3306),
    database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  });
  await waitFor(async () => {
    try {
      const response = await fetch(`${base}/health`);
      return response.ok ? true : null;
    } catch {
      return null;
    }
  }, 15_000, "the dedicated API to become ready");
  assert.match(childOutput, /automatic runs every 1 minute\(s\)/, "Scheduler did not enable from configuration.");
  const customer = (await post("auth/register", {
    email: `scheduler.${marker}@brightloop.test`, password: "Scheduler-Pass1!",
  })).data.user;
  const login = await post("auth/login", {
    email: process.env.SEED_ADMIN_EMAIL, password: process.env.SEED_ADMIN_PASSWORD,
  });
  assert.ok(login.cookie, "Admin session cookie missing.");
  const cookie = login.cookie;
  const product = (await post("products", {
    name: `Scheduler product ${marker}`, type: "Service", salesPrice: "100.00", costPrice: "0.00",
  }, cookie)).data;
  const plan = (await post("plans", {
    name: `Scheduler plan ${marker}`, price: "999.00", billingIntervalUnit: "MONTH",
    billingIntervalCount: 1, minimumQuantity: 1, availableFrom: "2020-01-01", availableUntil: "2099-12-31",
  }, cookie)).data;
  const subscription = (await post("subscriptions", {
    customerId: customer.id, planId: plan.id, startDate: today,
    lines: [{ productId: product.id, quantity: 1 }],
  }, cookie)).data;
  for (const action of ["quotation", "confirm", "activate"]) {
    const response = await fetch(`${base}/subscriptions/${subscription.id}/${action}`, {
      method: "POST", headers: { "content-type": "application/json", cookie }, body: "{}",
    });
    assert.equal(response.status, 200, `Could not ${action} scheduler fixture subscription.`);
  }
  const [before] = await connection.query("SELECT id FROM invoices WHERE subscription_id = ?", [subscription.id]);
  assert.equal(before.length, 0, "Fixture was invoiced before the scheduler tick.");
  const invoice = await waitFor(async () => {
    const [rows] = await connection.query(
      `SELECT i.id, i.grand_total, e.actor_user_id FROM invoices i
       JOIN subscription_events e ON e.subscription_id = i.subscription_id AND e.event_type = 'INVOICED'
       WHERE i.subscription_id = ? ORDER BY i.id DESC LIMIT 1`,
      [subscription.id],
    );
    return rows[0] ?? null;
  }, 80_000, "the scheduled invoice");
  assert.equal(invoice.actor_user_id, null, "Scheduled invoice event should have a system actor.");
  assert.equal(invoice.grand_total, "100.00", "Scheduler should use the same line-based billing service.");
  assert.match(childOutput, /automatic run: .*invoice\(s\)/, "Scheduler did not log its completed run.");
  console.log("The enabled scheduler created one invoice through the live API process, with a system audit event and line-based total.");
} finally {
  if (child.exitCode === null) {
    child.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 5_000)),
    ]);
  }
  if (connection) await connection.end();
}
