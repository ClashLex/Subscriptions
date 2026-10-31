/**
 * Acceptance tests for Phase 3 (catalogue: products/variants, taxes, plans).
 * Run with the API dev server up:  npm run test:catalogue
 * Idempotent via timestamped names.
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
    const [first] = entry.split(";");
    const eq = first.indexOf("=");
    const name = first.slice(0, eq).trim();
    const value = first.slice(eq + 1).trim();
    if (value === "") jar.delete(name);
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
  try { json = JSON.parse(text); } catch { /* 204 */ }
  return { status: res.status, json };
}

const P = x => JSON.stringify(x);
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
const admin = { email: process.env.SEED_ADMIN_EMAIL, password: process.env.SEED_ADMIN_PASSWORD };
const staffUser = {
  email: `staff.cat.${run}@demo.test`,
  password: "C4talogue-Pass!",
  displayName: `Catalogue Staff ${run}`,
};
let productId;
let variantId;
let taxId;
let planId;

await step("health ready", async () => {
  jar.clear();
  const r = await req("GET", "/health");
  assert.equal(r.status, 200);
});

await step("Admin login", async () => {
  jar.clear();
  const r = await req("POST", "/auth/login", { body: admin });
  assert.equal(r.status, 200, P(r));
});

await step("create product → 201 with exact money strings", async () => {
  const r = await req("POST", "/products", {
    body: { name: `Faucet ${run}`, type: "Device", salesPrice: "100.00", costPrice: "40.00", notes: "Demo product" },
  });
  assert.equal(r.status, 201, P(r));
  productId = r.json?.data?.id;
  assert.equal(r.json?.data?.salesPrice, "100.00");
  assert.equal(r.json?.data?.isActive, true);
});

await step("update product price → patch visible in detail", async () => {
  const r = await req("PATCH", `/products/${productId}`, { body: { salesPrice: "120.00" } });
  assert.equal(r.status, 200, P(r));
  const detail = await req("GET", `/products/${productId}`);
  assert.equal(detail.json?.data?.salesPrice, "120.00");
});

await step("variant +560 → effectivePrice 680.00 (brief's Odoo-brand example)", async () => {
  const r = await req("POST", `/products/${productId}/variants`, { body: { name: `Premium ${run}`, priceAdjustment: "560.00" } });
  assert.equal(r.status, 201, P(r));
  variantId = r.json?.data?.id;
  assert.equal(r.json?.data?.effectivePrice, "680.00");
  assert.equal(r.json?.data?.isActive, true);
});

await step("variant making effective price negative → 400", async () => {
  const r = await req("POST", `/products/${productId}/variants`, {
    body: { name: `Negative ${run}`, priceAdjustment: "-1000.00" },
  });
  assert.equal(r.status, 400, P(r));
  assert.equal(r.json?.error?.code, "EFFECTIVE_PRICE_NOT_ALLOWED");
});

await step("duplicate variant name on product → 409", async () => {
  const r = await req("POST", `/products/${productId}/variants`, { body: { name: `Premium ${run}`, priceAdjustment: "10.00" } });
  assert.equal(r.status, 409, P(r));
  assert.equal(r.json?.error?.code, "VARIANT_NAME_TAKEN");
});

await step("update variant priceAdjustment → effectivePrice recalculated", async () => {
  const r = await req("PATCH", `/products/${productId}/variants/${variantId}`, { body: { priceAdjustment: "80.00" } });
  assert.equal(r.status, 200, P(r));
  assert.equal(r.json?.data?.effectivePrice, "200.00");
});

await step("create tax 18% exclusive → 201", async () => {
  const r = await req("POST", "/taxes", { body: { name: `GST ${run}`, rate: "18.00", taxMode: "EXCLUSIVE" } });
  assert.equal(r.status, 201, P(r));
  taxId = r.json?.data?.id;
  assert.equal(r.json?.data?.taxMode, "EXCLUSIVE");
});

await step("tax rate > 99.99 rejected", async () => {
  const r = await req("POST", "/taxes", { body: { name: `Bad ${run}`, rate: "120.00" } });
  assert.equal(r.status, 400, P(r));
});

await step("update tax rate → 200", async () => {
  const r = await req("PATCH", `/taxes/${taxId}`, { body: { rate: "28.00" } });
  assert.equal(r.status, 200, P(r));
  assert.equal(r.json?.data?.rate, "28.00");
});

await step("create monthly plan with availability window → 201", async () => {
  const r = await req("POST", "/plans", {
    body: {
      name: `Monthly Basic ${run}`,
      description: "Demo monthly plan",
      price: "999.00",
      billingIntervalUnit: "MONTH",
      billingIntervalCount: 1,
      minimumQuantity: 1,
      availableFrom: "2020-01-01",
      availableUntil: "2099-12-31",
      allowPause: true,
      allowEarlyClose: true,
      allowRenewal: true,
      autoClose: false,
    },
  });
  assert.equal(r.status, 201, P(r));
  planId = r.json?.data?.id;
  assert.equal(r.json?.data?.billingIntervalUnit, "MONTH");
});

await step("plan with unsupported interval → 400", async () => {
  const r = await req("POST", "/plans", { body: { name: `Bad interval ${run}`, price: "10.00", billingIntervalUnit: "BIWEEKLY" } });
  assert.equal(r.status, 400, P(r));
  assert.equal(r.json?.error?.code, "VALIDATION_ERROR");
});

await step("plan with reversed availability window → 400", async () => {
  const r = await req("POST", "/plans", {
    body: { name: `Reversed ${run}`, price: "10.00", availableFrom: "2099-01-01", availableUntil: "2020-01-01" },
  });
  assert.equal(r.status, 400, P(r));
  assert.equal(r.json?.error?.code, "INVALID_AVAILABILITY_WINDOW");
});

await step("plan name taken → 409", async () => {
  const r = await req("POST", "/plans", { body: { name: `Monthly Basic ${run}`, price: "10.00" } });
  assert.equal(r.status, 409, P(r));
  assert.equal(r.json?.error?.code, "PLAN_NAME_TAKEN");
});

await step("list plans / products metadata present", async () => {
  const r = await req("GET", "/plans?pageSize=5");
  assert.equal(r.status, 200, P(r));
  assert.ok(r.json?.meta?.total >= 1);
  const p = await req("GET", "/products?search=Faucet");
  assert.equal(p.status, 200, P(p));
  assert.ok(p.json?.data?.some((row) => row.id === productId));
});

await step("Admin/staff roles: create staff for visibility checks", async () => {
  const r = await req("POST", "/users/staff", { body: staffUser });
  assert.equal(r.status, 201, P(r));
});

await step("Staff can read catalogue but cannot write", async () => {
  jar.clear();
  const login = await req("POST", "/auth/login", { body: { email: staffUser.email, password: staffUser.password } });
  assert.equal(login.status, 200, P(login));
  const read = await req("GET", "/products");
  assert.equal(read.status, 200, P(read));
  const pl = await req("GET", "/plans?includeInactive=1");
  assert.equal(pl.status, 200, P(pl));
  const tx = await req("GET", "/taxes");
  assert.equal(tx.status, 200, P(tx));
  const write = await req("POST", "/products", { body: { name: "X", type: "Y", salesPrice: "1.00", costPrice: "1.00" } });
  assert.equal(write.status, 403, P(write));
});

await step("Customer cannot read catalogue but sees available plans", async () => {
  jar.clear();
  const creds = { email: `cust.cat.${run}@demo.test`, password: "Cust0mer-Pass!" };
  const reg = await req("POST", "/auth/register", { body: creds });
  assert.equal(reg.status, 201, P(reg));
  const login = await req("POST", "/auth/login", { body: creds });
  assert.equal(login.status, 200, P(login));
  const read = await req("GET", "/products");
  assert.equal(read.status, 403, P(read));
  const pl = await req("GET", "/plans");
  assert.equal(pl.status, 200, P(pl));
  assert.ok(pl.json?.data?.some((row) => row.id === planId));
  const plInactive = await req("GET", "/plans?includeInactive=1");
  // includeInactive is ignored for customers — response must still exist, fine either way.
  assert.equal(plInactive.status, 200, P(plInactive));
});

await step("deactivate product → default list hides it, includeInactive shows it", async () => {
  jar.clear();
  const login = await req("POST", "/auth/login", { body: admin });
  assert.equal(login.status, 200, P(login));
  const patch = await req("PATCH", `/products/${productId}`, { body: { isActive: false } });
  assert.equal(patch.status, 200, P(patch));
  const visibleList = await req("GET", "/products?search=Faucet");
  assert.ok(!visibleList.json?.data?.some((row) => row.id === productId));
  const allList = await req("GET", "/products?search=Faucet&includeInactive=1");
  assert.ok(allList.json?.data?.some((row) => row.id === productId));
});

await step("unknown product → 404", async () => {
  const r = await req("GET", "/products/99999999");
  assert.equal(r.status, 404, P(r));
  assert.equal(r.json?.error?.code, "NOT_FOUND");
});

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exitCode = failures === 0 ? 0 : 1;
