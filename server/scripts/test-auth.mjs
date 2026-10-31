/**
 * Acceptance tests for Phase 2 (authentication, roles, password reset).
 * Run with the API dev server up:  npm run test:auth
 * Exits 0 when every step passes; prints PASS/FAIL per step.
 * Idempotent: uses timestamped emails so it can be re-run.
 */
import assert from "node:assert/strict";

const PORT = process.env.PORT ?? 4000;
const BASE = `http://127.0.0.1:${PORT}/api/v1`;
const jar = new Map();

function cookieHeader() {
  return [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
}

function storeCookies(res) {
  const list = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  for (const entry of list) {
    const [first, ...attrs] = entry.split(";");
    const eq = first.indexOf("=");
    const name = first.slice(0, eq).trim();
    const value = first.slice(eq + 1).trim();
    const expired = attrs.some((a) => /expires=.*19[67]0|expires=.*(1 Jan|01 jan)/i.test(a));
    const maxAgeZero = attrs.some((a) => {
      const [k, v] = a.split("=").map((x) => x.trim());
      return k.toLowerCase() === "max-age" && (v === "0" || v === "-1");
    });
    if (value === "" || expired || maxAgeZero) jar.delete(name);
    else jar.set(name, value);
  }
}

async function req(method, path, { body } = {}) {
  const headers = { "content-type": "application/json" };
  if (jar.size > 0) headers.cookie = cookieHeader();
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  storeCookies(res);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* 204 responses have no body */ }
  return { status: res.status, json };
}

const P = customer => JSON.stringify(customer);
let failures = 0;
async function step(name, fn) {
  try {
    await fn();
    console.log(`PASS  ${name}`);
  } catch (error) {
    failures += 1;
    console.log(`FAIL  ${name} — ${error?.message ?? error}`);
  }
}

const run = Date.now();
const customerA = { email: `cust.a.${run}@demo.test`, password: "Sup3r-Secret9!" };
const customerB = { email: `cust.b.${run}@demo.test`, password: "An0ther-Secret!" };
const staffUser = { email: `staff.${run}@demo.test`, password: "St4ff-Passphrase!", displayName: `Staff ${run}` };
const admin = { email: process.env.SEED_ADMIN_EMAIL, password: process.env.SEED_ADMIN_PASSWORD };
const newPassword = "R3freshed-Passphrase!";
let staffSid;
let adminSid;

await step("health check is ready", async () => {
  jar.clear();
  const r = await req("GET", "/health");
  assert.equal(r.status, 200);
  assert.equal(r.json?.data?.checks?.database, true);
});

await step("register Customer A", async () => {
  jar.clear();
  const r = await req("POST", "/auth/register", { body: { ...customerA, displayName: "Customer A" } });
  assert.equal(r.status, 201, P(r));
  assert.equal(r.json?.data?.user?.role, "CUSTOMER");
});

await step("duplicate email (case/space variant) is rejected", async () => {
  jar.clear();
  const r = await req("POST", "/auth/register", { body: { email: `  ${customerA.email.toUpperCase()} `, password: customerA.password } });
  assert.equal(r.status, 409, P(r));
  assert.equal(r.json?.error?.code, "EMAIL_TAKEN");
});

await step("short password rejected", async () => {
  jar.clear();
  const r = await req("POST", "/auth/register", { body: { email: `short.${run}@demo.test`, password: "Sh0rt!1" } });
  assert.equal(r.status, 400, P(r));
  assert.equal(r.json?.error?.code, "VALIDATION_ERROR");
});

await step("password missing uppercase rejected", async () => {
  jar.clear();
  const r = await req("POST", "/auth/register", { body: { email: `noupper.${run}@demo.test`, password: "lowercase-only!" } });
  assert.equal(r.status, 400, P(r));
});

await step("register Customer B", async () => {
  jar.clear();
  const r = await req("POST", "/auth/register", { body: { ...customerB } });
  assert.equal(r.status, 201, P(r));
});

await step("login with wrong password fails generically", async () => {
  jar.clear();
  const r = await req("POST", "/auth/login", { body: { email: customerA.email, password: "Wr0ng-Passphrase!" } });
  assert.equal(r.status, 401, P(r));
  assert.equal(r.json?.error?.code, "INVALID_CREDENTIALS");
});

await step("Customer A login → /me returns role", async () => {
  jar.clear();
  const r = await req("POST", "/auth/login", { body: customerA });
  assert.equal(r.status, 200, P(r));
  const me = await req("GET", "/auth/me");
  assert.equal(me.status, 200, P(me));
  assert.equal(me.json?.data?.user?.role, "CUSTOMER");
});

await step("POST /users (staff mgmt) blocked: anonymous → 401", async () => {
  jar.clear();
  const r = await req("POST", "/users/staff", { body: staffUser });
  assert.equal(r.status, 401, P(r));
});

await step("Customer A re-login for role checks", async () => {
  jar.clear();
  const r = await req("POST", "/auth/login", { body: customerA });
  assert.equal(r.status, 200, P(r));
});

await step("POST /users/staff blocked: customer role → 403", async () => {
  const r = await req("POST", "/users/staff", { body: staffUser });
  assert.equal(r.status, 403, P(r));
});

await step("GET /users blocked: customer role → 403", async () => {
  const r = await req("GET", "/users");
  assert.equal(r.status, 403, P(r));
});

await step("Customer A logout → session invalidated", async () => {
  const r = await req("POST", "/auth/logout");
  assert.equal(r.status, 204, P(r));
  const me = await req("GET", "/auth/me");
  assert.equal(me.status, 401, P(me));
});

await step("Admin login", async () => {
  jar.clear();
  assert.ok(admin.email, "SEED_ADMIN_EMAIL missing from .env");
  const r = await req("POST", "/auth/login", { body: admin });
  assert.equal(r.status, 200, P(r));
  assert.equal(r.json?.data?.user?.role, "ADMIN");
});

let staffRecord;
await step("Admin creates staff → 201", async () => {
  const r = await req("POST", "/users/staff", { body: staffUser });
  assert.equal(r.status, 201, P(r));
  staffRecord = r.json?.data?.user;
  assert.equal(staffRecord?.role, "STAFF");
});

let adminId;
await step("Admin lists users → 200", async () => {
  const r = await req("GET", "/users");
  assert.equal(r.status, 200, P(r));
  const list = r.json?.data ?? [];
  assert.ok(list.length >= 1);
  adminId = list.find((u) => u.email === admin.email)?.id;
  assert.ok(adminId, "admin present in user list");
});

await step("Staff can log in", async () => {
  jar.clear();
  const r = await req("POST", "/auth/login", { body: { email: staffUser.email, password: staffUser.password } });
  assert.equal(r.status, 200, P(r));
  const me = await req("GET", "/auth/me");
  assert.equal(me.json?.data?.user?.role, "STAFF");
  staffSid = jar.get("subscriptions.sid");
});

await step("Staff cannot deactivate accounts (403)", async () => {
  const r = await req("PATCH", `/users/${staffRecord?.id}/status`, { body: { isActive: false } });
  assert.equal(r.status, 403, P(r));
});

await step("Admin re-login for status changes", async () => {
  jar.clear();
  const r = await req("POST", "/auth/login", { body: admin });
  assert.equal(r.status, 200, P(r));
  adminSid = jar.get("subscriptions.sid");
});

await step("Admin deactivates staff → 200; deactivated staff loses access", async () => {
  const r = await req("PATCH", `/users/${staffRecord?.id}/status`, { body: { isActive: false } });
  assert.equal(r.status, 200, P(r));
  // Verify the deactivated account cannot authenticate (keeps admin cookies).
  const adminCookies = new Map(jar);
  jar.clear();
  // Prove immediate revocation: yesterday's still-valid staff cookie is dead.
  jar.set("subscriptions.sid", staffSid ?? "");
  const revokedMe = await req("GET", "/auth/me");
  assert.equal(revokedMe.status, 401, P(revokedMe));
  const staffLogin = await req("POST", "/auth/login", {
    body: { email: staffUser.email, password: staffUser.password },
  });
  assert.equal(staffLogin.status, 401, P(staffLogin));
  jar.clear();
  jar.set("subscriptions.sid", adminCookies.get("subscriptions.sid") ?? "");
  // Re-activate for later potential use (admin cookie restored).
  const r2 = await req("PATCH", `/users/${staffRecord?.id}/status`, { body: { isActive: true } });
  assert.equal(r2.status, 200, P(r2));
});

await step("Admin cannot change own status → 400", async () => {
  const r = await req("PATCH", `/users/${adminId}/status`, { body: { isActive: false } });
  assert.equal(r.status, 400, P(r));
});

await step("forgot-password: unknown email gets generic 200", async () => {
  jar.clear();
  const r = await req("POST", "/auth/forgot-password", { body: { email: `nobody.${run}@demo.test` } });
  assert.equal(r.status, 200, P(r));
  assert.ok(r.json?.data?.message);
  assert.equal(r.json?.data?.devUrl, undefined);
});

let resetToken;
await step("forgot-password: registered email returns dev fallback link", async () => {
  const r = await req("POST", "/auth/forgot-password", { body: { email: customerA.email } });
  assert.equal(r.status, 200, P(r));
  const devUrl = r.json?.data?.devUrl;
  assert.ok(devUrl, "expected dev fallback URL in development (SMTP not configured)");
  resetToken = new URL(devUrl).searchParams.get("token");
  assert.match(resetToken, /^[a-f0-9]{64}$/);
});

await step("reset with weak password rejected", async () => {
  const r = await req("POST", "/auth/reset-password", { body: { token: resetToken, password: "weak" } });
  assert.equal(r.status, 400, P(r));
});

await step("reset succeeds then token is single-use", async () => {
  const r = await req("POST", "/auth/reset-password", { body: { token: resetToken, password: newPassword } });
  assert.equal(r.status, 200, P(r));
  const r2 = await req("POST", "/auth/reset-password", { body: { token: resetToken, password: newPassword } });
  assert.equal(r2.status, 400, P(r2));
});

await step("old password fails; new password works", async () => {
  jar.clear();
  const oldLogin = await req("POST", "/auth/login", { body: customerA });
  assert.equal(oldLogin.status, 401, P(oldLogin));
  const newLogin = await req("POST", "/auth/login", { body: { email: customerA.email, password: newPassword } });
  assert.equal(newLogin.status, 200, P(newLogin));
});

await step("unknown route → 404 envelope", async () => {
  jar.clear();
  const r = await req("GET", "/definitely-not-a-route");
  assert.equal(r.status, 404, P(r));
  assert.equal(r.json?.error?.code, "NOT_FOUND");
});

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exitCode = failures === 0 ? 0 : 1;
