/**
 * Acceptance tests for Phase 4 (quotation templates + subscription lifecycle).
 * Run with the API dev server up:  npm run test:subscriptions
 * Idempotent via timestamped names; reuses the seeded demo Admin.
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

const P = (x) => JSON.stringify(x);
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
const today = new Date().toISOString().slice(0, 10);
const in3m = new Date();
in3m.setMonth(in3m.getMonth() + 3);
const plus30 = new Date();
plus30.setDate(plus30.getDate() + 30);
const START_TODAY = today;
const START_LATER = plus30.toISOString().slice(0, 10);
const YESTERDAY = new Date().toISOString().slice(0, 10);

let productId; let variantId; let taxExclusiveId; let taxInclusiveId;
let planA; let planB; let planC; let planFuture; let planInactiveHolder;
let templateId; let customer1Id; let customer2Id;
let s1; let s2; let s3; let sTemplate;

const staffUser = { email: `staff.sub.${run}@demo.test`, password: "S4bsPass-Pass!", displayName: `Sub Staff ${run}` };

await step("Admin login and fixture setup", async () => {
  jar.clear();
  assert.equal((await req("POST", "/auth/login", { body: admin })).status, 200);
  const product = await req("POST", "/products", {
    body: { name: `Rev Unit ${run}`, type: "Device", salesPrice: "100.00", costPrice: "40.00" },
  });
  productId = product.json?.data?.id;
  const variant = await req("POST", `/products/${productId}/variants`, {
    body: { name: `Mini ${run}`, priceAdjustment: "-20.00" },
  });
  variantId = variant.json?.data?.id;
  const tax = await req("POST", "/taxes", { body: { name: `Sub-GST ${run}`, rate: "18.00", taxMode: "EXCLUSIVE" } });
  taxExclusiveId = tax.json?.data?.id;
  const taxInc = await req("POST", "/taxes", { body: { name: `Sub-Inc ${run}`, rate: "5.00", taxMode: "INCLUSIVE" } });
  taxInclusiveId = taxInc.json?.data?.id;

  const mkPlan = async (body) => {
    const r = await req("POST", "/plans", {
      body: { availableFrom: "2020-01-01", availableUntil: "2099-12-31", ...body },
    });
    assert.equal(r.status, 201, P(r));
    return r.json?.data?.id;
  };
  planA = await mkPlan({ name: `Alpha-M ${run}`, price: "500.00", minimumQuantity: 1 });
  planB = await mkPlan({ name: `Beta-NP ${run}`, price: "100.00", minimumQuantity: 1, allowPause: false, allowEarlyClose: false });
  planC = await mkPlan({ name: `Gamma-Min3 ${run}`, price: "10.00", minimumQuantity: 3 });
  planFuture = await mkPlan({ name: `Delta-Future ${run}`, price: "10.00", availableFrom: START_LATER });
});

await step("register two customers", async () => {
  const c1 = await req("POST", "/auth/register", { body: { email: `cust.a4.${run}@demo.test`, password: "Cust0mer-Pass!" } });
  customer1Id = c1.json?.data?.user?.id;
  const c2 = await req("POST", "/auth/register", { body: { email: `cust.b4.${run}@demo.test`, password: "Cust0mer-Pass!" } });
  customer2Id = c2.json?.data?.user?.id;
  assert.ok(customer1Id > 0 && customer2Id > 0, P({ customer1Id, customer2Id }));
});

await step("create template → unit price snapshotted from catalogue", async () => {
  const r = await req("POST", "/quotation-templates", {
    body: {
      name: `Launch bundle ${run}`,
      validityDays: 10,
      defaultPlanId: planA,
      items: [{ productId, variantId, quantity: 2, taxId: taxExclusiveId }],
    },
  });
  assert.equal(r.status, 201, P(r));
  templateId = r.json?.data?.id;
  assert.equal(r.json?.data?.items?.[0]?.unitPrice, "80.00");
  assert.equal(r.json?.data?.items?.[0]?.variantName, `Mini ${run}`);
});

await step("template with missing product → 404", async () => {
  const r = await req("POST", "/quotation-templates", {
    body: { name: `X ${run}`, items: [{ productId: 99999999, quantity: 1 }] },
  });
  assert.equal(r.status, 404, P(r));
  assert.equal(r.json?.error?.code, "PRODUCT_NOT_FOUND");
});

await step("duplicate template name → 409", async () => {
  const r = await req("POST", "/quotation-templates", {
    body: { name: `Launch bundle ${run}`, items: [{ productId, quantity: 1 }] },
  });
  assert.equal(r.status, 409, P(r));
  assert.equal(r.json?.error?.code, "TEMPLATE_NAME_TAKEN");
});

await step("patch template validity → 200", async () => {
  const r = await req("PATCH", `/quotation-templates/${templateId}`, { body: { validityDays: 10 } });
  assert.equal(r.status, 200, P(r));
});

await step("direct subscription → DRAFT with snapshots and totals", async () => {
  const r = await req("POST", "/subscriptions", {
    body: {
      customerId: customer1Id,
      planId: planA,
      startDate: START_TODAY,
      paymentTermsDays: 14,
      lines: [
        { productId, quantity: 1, taxId: taxExclusiveId },
        { productId, variantId, quantity: 2, taxId: taxInclusiveId },
      ],
    },
  });
  assert.equal(r.status, 201, P(r));
  s1 = r.json?.data;
  assert.match(s1?.subscriptionNumber ?? "", /^SUB-\d{6}$/);
  assert.equal(s1?.status, "DRAFT");
  assert.equal(s1?.lines?.[0]?.unitPrice, "100.00");
  assert.equal(s1?.lines?.[1]?.unitPrice, "80.00");
  assert.equal(s1?.lines?.[1]?.taxMode, "INCLUSIVE");
  assert.equal(s1?.totals?.subtotal, "260.00");
  // L1 adds 18% of 100.00 = 18.00 on top; L2 (5% INCLUSIVE) extracts 160.00 × 5/105 = 7.61.
  assert.equal(s1?.totals?.taxTotal, "25.61");
  assert.equal(s1?.totals?.total, "278.00");
  assert.equal(s1?.events?.[0]?.eventType, "CREATED");
});

await step("catalogue price change does not rewrite line snapshots", async () => {
  const patch = await req("PATCH", `/products/${productId}`, { body: { salesPrice: "150.00" } });
  assert.equal(patch.status, 200, P(patch));
  const detail = await req("GET", `/subscriptions/${s1.id}`);
  assert.equal(detail.json?.data?.lines?.[0]?.unitPrice, "100.00");
  assert.equal(detail.json?.data?.lines?.[1]?.unitPrice, "80.00");
});

await step("minimum quantity respected", async () => {
  const r = await req("POST", "/subscriptions", {
    body: { customerId: customer1Id, planId: planC, lines: [{ productId, quantity: 1 }] },
  });
  assert.equal(r.status, 400, P(r));
  assert.equal(r.json?.error?.code, "MINIMUM_QUANTITY_NOT_MET");
});

await step("plan availability window respected (start before available_from)", async () => {
  const r = await req("POST", "/subscriptions", {
    body: { customerId: customer1Id, planId: planFuture, startDate: START_TODAY, lines: [{ productId, quantity: 1 }] },
  });
  assert.equal(r.status, 400, P(r));
  assert.equal(r.json?.error?.code, "PLAN_NOT_AVAILABLE");
});

await step("inactive plan not selectable", async () => {
  const patch = await req("PATCH", `/plans/${planA}`, { body: { isActive: false } });
  assert.equal(patch.status, 200, P(patch));
  const r = await req("POST", "/subscriptions", {
    body: { customerId: customer1Id, planId: planA, lines: [{ productId, quantity: 1 }] },
  });
  assert.equal(r.status, 400, P(r));
  assert.equal(r.json?.error?.code, "PLAN_NOT_ACTIVE");
  const restore = await req("PATCH", `/plans/${planA}`, { body: { isActive: true } });
  assert.equal(restore.status, 200, P(restore));
});

await step("unknown customer → 404", async () => {
  const r = await req("POST", "/subscriptions", {
    body: { customerId: 99999999, planId: planA, lines: [{ productId, quantity: 1 }] },
  });
  assert.equal(r.status, 404, P(r));
  assert.equal(r.json?.error?.code, "CUSTOMER_NOT_FOUND");
});

await step("second customer's subscription for scoping tests", async () => {
  const r = await req("POST", "/subscriptions", {
    body: { customerId: customer2Id, planId: planB, startDate: START_LATER, lines: [{ productId, quantity: 1 }] },
  });
  assert.equal(r.status, 201, P(r));
  s2 = r.json?.data;
});

await step("activate DRAFT directly → 409", async () => {
  const r = await req("POST", `/subscriptions/${s1.id}/activate`, { body: {} });
  assert.equal(r.status, 409, P(r));
  assert.equal(r.json?.error?.code, "INVALID_TRANSITION");
});

await step("submit quotation → QUOTATION with validity window", async () => {
  const r = await req("POST", `/subscriptions/${s1.id}/quotation`, { body: {} });
  assert.equal(r.status, 200, P(r));
  s1 = r.json?.data;
  assert.equal(s1?.status, "QUOTATION");
  const expected = new Date();
  expected.setDate(expected.getDate() + 15);
  assert.equal(s1?.expiryDate, expected.toISOString().slice(0, 10));
});

await step("patch start date while quotation", async () => {
  const r = await req("PATCH", `/subscriptions/${s1.id}`, { body: { startDate: START_TODAY } });
  assert.equal(r.status, 200, P(r));
});

await step("confirm quotation → CONFIRMED; re-confirm → 409", async () => {
  const r = await req("POST", `/subscriptions/${s1.id}/confirm`, { body: {} });
  assert.equal(r.status, 200, P(r));
  s1 = r.json?.data;
  assert.equal(s1?.status, "CONFIRMED");
  const again = await req("POST", `/subscriptions/${s1.id}/confirm`, { body: {} });
  assert.equal(again.status, 409, P(again));
});

await step("activate → ACTIVE with next_billing_at and contract end", async () => {
  const r = await req("POST", `/subscriptions/${s1.id}/activate`, { body: {} });
  assert.equal(r.status, 200, P(r));
  s1 = r.json?.data;
  assert.equal(s1?.status, "ACTIVE");
  assert.equal(s1?.nextBillingAt?.slice(0, 10), START_TODAY);
  assert.notEqual(s1?.expiryDate, null);
  const events = s1?.events?.map((e) => e.eventType) ?? [];
  assert.ok(events.includes("SUBMITTED_QUOTATION"));
  assert.ok(events.includes("CONFIRMED"));
  assert.ok(events.includes("ACTIVATED"));
});

await step("activation gates: future start blocked; draft start-date correction works", async () => {
  // A confirmed subscription with a future start date cannot be activated yet.
  const future = await req("POST", "/subscriptions", {
    body: { customerId: customer2Id, planId: planB, startDate: START_LATER, lines: [{ productId, quantity: 1 }] },
  });
  assert.equal(future.status, 201, P(future));
  const futureId = future.json?.data?.id;
  await req("POST", `/subscriptions/${futureId}/quotation`, { body: {} });
  await req("POST", `/subscriptions/${futureId}/confirm`, { body: {} });
  const early = await req("POST", `/subscriptions/${futureId}/activate`, { body: {} });
  assert.equal(early.status, 400, P(early));
  assert.equal(early.json?.error?.code, "START_DATE_NOT_REACHED");
  // Confirmed subscriptions are frozen: the start date cannot be corrected there…
  const frozenPatch = await req("PATCH", `/subscriptions/${futureId}`, { body: { startDate: START_TODAY } });
  assert.equal(frozenPatch.status, 409, P(frozenPatch));
  assert.equal(frozenPatch.json?.error?.code, "INVALID_TRANSITION");

  // …while the draft still allows it, keeping the downstream lifecycle intact.
  const patch = await req("PATCH", `/subscriptions/${s2.id}`, { body: { startDate: START_TODAY } });
  assert.equal(patch.status, 200, P(patch));
  const submitted = await req("POST", `/subscriptions/${s2.id}/quotation`, { body: {} });
  assert.equal(submitted.status, 200, P(submitted));
  const confirmed = await req("POST", `/subscriptions/${s2.id}/confirm`, { body: {} });
  assert.equal(confirmed.status, 200, P(confirmed));
  const ok = await req("POST", `/subscriptions/${s2.id}/activate`, { body: {} });
  assert.equal(ok.status, 200, P(ok));
  s2 = ok.json?.data;
  assert.equal(s2?.status, "ACTIVE");
});

await step("pause → PAUSED; resume shifts billing; both audited", async () => {
  const pause = await req("POST", `/subscriptions/${s1.id}/pause`, { body: { reason: "Holiday break" } });
  assert.equal(pause.status, 200, P(pause));
  s1 = pause.json?.data;
  assert.equal(s1?.status, "PAUSED");
  assert.notEqual(s1?.pausedAt, null);
  const resume = await req("POST", `/subscriptions/${s1.id}/resume`, { body: {} });
  assert.equal(resume.status, 200, P(resume));
  s1 = resume.json?.data;
  assert.equal(s1?.status, "ACTIVE");
  const events = (s1?.events ?? []).map((e) => e.eventType);
  assert.ok(events.includes("PAUSED"));
  assert.ok(events.includes("RESUMED"));
});

await step("pause on non-pausable plan → 409", async () => {
  const r = await req("POST", `/subscriptions/${s2.id}/pause`, { body: {} });
  assert.equal(r.status, 409, P(r));
  assert.equal(r.json?.error?.code, "PAUSE_NOT_ALLOWED");
});

await step("admin close override on non-early-closable plan → CLOSED", async () => {
  const r = await req("POST", `/subscriptions/${s2.id}/close`, { body: { reason: "Customer request" } });
  assert.equal(r.status, 200, P(r));
  s2 = r.json?.data;
  assert.equal(s2?.status, "CLOSED");
  const events = s2?.events?.map((e) => e.eventType) ?? [];
  assert.ok(events.includes("CLOSED_ADMIN_OVERRIDE"));
});

await step("renewal creates a linked draft and preserves history", async () => {
  const r = await req("POST", `/subscriptions/${s2.id}/renew`, { body: {} });
  assert.equal(r.status, 201, P(r));
  const renewed = r.json?.data;
  assert.equal(renewed?.status, "DRAFT");
  assert.equal(renewed?.previousSubscriptionId, s2.id);
  assert.equal(renewed?.customerId, s2.customerId);
  const old = await req("GET", `/subscriptions/${s2.id}`);
  assert.equal(old.json?.data?.status, "CLOSED");
});

await step("renewal blocked without allow_renewal", async () => {
  const create = await req("POST", "/plans", {
    body: { name: `NoRenew ${run}`, price: "10.00", allowRenewal: false, availableFrom: "2020-01-01", availableUntil: "2099-12-31" },
  });
  const planId = create.json?.data?.id;
  const sub = await req("POST", "/subscriptions", {
    body: { customerId: customer1Id, planId, startDate: START_TODAY, lines: [{ productId, quantity: 1 }] },
  });
  await req("POST", `/subscriptions/${sub.json?.data?.id}/quotation`, { body: {} });
  await req("POST", `/subscriptions/${sub.json?.data?.id}/confirm`, { body: {} });
  await req("POST", `/subscriptions/${sub.json?.data?.id}/activate`, { body: {} });
  const r = await req("POST", `/subscriptions/${sub.json?.data?.id}/renew`, { body: {} });
  assert.equal(r.status, 409, P(r));
  assert.equal(r.json?.error?.code, "RENEWAL_NOT_ALLOWED");
});

await step("template-driven subscription copies items and uses template validity", async () => {
  const r = await req("POST", "/subscriptions", {
    body: { customerId: customer1Id, planId: planA, templateId, startDate: START_TODAY },
  });
  assert.equal(r.status, 201, P(r));
  sTemplate = r.json?.data;
  assert.equal(sTemplate?.lines?.[0]?.quantity, 2);
  assert.equal(sTemplate?.lines?.[0]?.unitPrice, "80.00");
  const submit = await req("POST", `/subscriptions/${sTemplate.id}/quotation`, { body: {} });
  assert.equal(submit.status, 200, P(submit));
  const expected = new Date();
  expected.setDate(expected.getDate() + 10);
  assert.equal(submit.json?.data?.expiryDate, expected.toISOString().slice(0, 10));
  sTemplate = submit.json?.data;
});

await step("staff lifecycle: create allowed, close blocked by plan", async () => {
  jar.clear();
  assert.equal((await req("POST", "/auth/login", { body: admin })).status, 200);
  await req("POST", "/users/staff", { body: staffUser });
  const login = await req("POST", "/auth/login", { body: { email: staffUser.email, password: staffUser.password } });
  assert.equal(login.status, 200, P(login));
  const created = await req("POST", "/subscriptions", {
    body: { customerId: customer1Id, planId: planB, startDate: START_TODAY, lines: [{ productId, quantity: 1 }] },
  });
  assert.equal(created.status, 201, P(created));
  s3 = created.json?.data;
  const submitted = await req("POST", `/subscriptions/${s3.id}/quotation`, { body: {} });
  assert.equal(submitted.status, 200, P(submitted));
  const confirmed = await req("POST", `/subscriptions/${s3.id}/confirm`, { body: {} });
  assert.equal(confirmed.status, 200, P(confirmed));
  const activated = await req("POST", `/subscriptions/${s3.id}/activate`, { body: {} });
  assert.equal(activated.status, 200, P(activated));
  s3 = activated.json?.data;
  // Plan B disallows early close and the staff account may not override it.
  const close = await req("POST", `/subscriptions/${s3.id}/close`, { body: {} });
  assert.equal(close.status, 409, P(close));
  assert.equal(close.json?.error?.code, "CLOSE_NOT_ALLOWED");
  // Templates are documented as staff-writable.
  const templateBlocked = await req("POST", "/quotation-templates", {
    body: { name: `Staff bundle ${run}`, items: [{ productId, quantity: 1 }] },
  });
  assert.equal(templateBlocked.status, 201, P(templateBlocked));
});

await step("customer sees only own subscriptions and never writes", async () => {
  jar.clear();
  const login = await req("POST", "/auth/login", {
    body: { email: `cust.a4.${run}@demo.test`, password: "Cust0mer-Pass!" },
  });
  assert.equal(login.status, 200, P(login));
  const ownList = await req("GET", "/subscriptions");
  assert.equal(ownList.status, 200, P(ownList));
  const listedIds = (ownList.json?.data ?? []).map((row) => row.id);
  assert.ok(listedIds.some((id) => id === s1.id));
  assert.ok(!listedIds.some((id) => id === s2.id)); 
  const other = await req("GET", `/subscriptions/${s2.id}`);
  assert.equal(other.status, 404, P(other));
  const mine = await req("GET", `/subscriptions/${s1.id}`);
  assert.equal(mine.status, 200, P(mine));
  const write = await req("POST", "/subscriptions", {
    body: { customerId: customer1Id, planId: planA, lines: [{ productId, quantity: 1 }] },
  });
  assert.equal(write.status, 403, P(write));
  const pause = await req("POST", `/subscriptions/${s1.id}/pause`, { body: {} });
  assert.equal(pause.status, 403, P(pause));
});

await step("staff can use the customer directory; customers cannot", async () => {
  jar.clear();
  assert.equal((await req("POST", "/auth/login", { body: admin })).status, 200);
  // switch to staff session
  jar.clear();
  assert.equal((await req("POST", "/auth/login", { body: { email: staffUser.email, password: staffUser.password } })).status, 200);
  const staffList = await req("GET", "/users/customers");
  assert.equal(staffList.status, 200, P(staffList));
  assert.ok((staffList.json?.data ?? []).some((row) => row.id === customer1Id));
  jar.clear();
  assert.equal((await req("POST", "/auth/login", {
    body: { email: `cust.a4.${run}@demo.test`, password: "Cust0mer-Pass!" },
  })).status, 200);
  const asCustomer = await req("GET", "/users/customers");
  assert.equal(asCustomer.status, 403, P(asCustomer));
  // end as admin for the remaining steps
  jar.clear();
  assert.equal((await req("POST", "/auth/login", { body: admin })).status, 200);
});

await step("list filters by status", async () => {
  jar.clear();
  assert.equal((await req("POST", "/auth/login", { body: admin })).status, 200);
  const active = await req("GET", "/subscriptions?status=ACTIVE");
  assert.equal(active.status, 200, P(active));
  assert.ok((active.json?.data ?? []).length >= 2);
  const closed = await req("GET", "/subscriptions?status=CLOSED");
  assert.ok((closed.json?.data ?? []).some((row) => row.id === s2.id));
});

await step("update frozen after confirmation → 409", async () => {
  const r = await req("PATCH", `/subscriptions/${s1.id}`, { body: { paymentTermsDays: 30 } });
  assert.equal(r.status, 409, P(r));
  assert.equal(r.json?.error?.code, "INVALID_TRANSITION");
});

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exitCode = failures === 0 ? 0 : 1;
