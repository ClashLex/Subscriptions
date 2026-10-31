/**
 * Acceptance tests for Phase 5 (discounts, recurring billing, invoices, and payments).
 * Run with the API dev server up: npm run test:billing
 */
import assert from "node:assert/strict";

const PORT = process.env.PORT ?? 4000;
const BASE = `http://127.0.0.1:${PORT}/api/v1`;
const jar = new Map();
const run = Date.now();
const admin = { email: process.env.SEED_ADMIN_EMAIL, password: process.env.SEED_ADMIN_PASSWORD };
const today = new Date().toISOString().slice(0, 10);

function cookieHeader() {
  return [...jar].map(([key, value]) => `${key}=${value}`).join("; ");
}

function storeCookies(response) {
  const cookies = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  for (const cookie of cookies) {
    const [first] = cookie.split(";");
    const separator = first.indexOf("=");
    const name = first.slice(0, separator).trim();
    const value = first.slice(separator + 1).trim();
    if (value === "") jar.delete(name);
    else jar.set(name, value);
  }
}

async function req(method, path, { body } = {}) {
  const headers = { "content-type": "application/json" };
  if (jar.size > 0) headers.cookie = cookieHeader();
  const response = await fetch(BASE + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  storeCookies(response);
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* 204 */ }
  return { status: response.status, json };
}

const show = (value) => JSON.stringify(value);
function minor(value) {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}
let failures = 0;
async function step(name, work) {
  try {
    await work();
    console.log(`PASS  ${name}`);
  } catch (error) {
    failures += 1;
    console.log(`FAIL  ${name} — ${error?.message ?? error}`);
  }
}

let customerId;
let productId;
let tinyProductId;
let taxId;
let roundingTaxId;
let planId;
let subscriptionId;
let tinySubscriptionId;
let invoiceId;
let tinyInvoiceId;
let recurringId;

await step("anonymous billing trigger is rejected", async () => {
  jar.clear();
  const response = await req("POST", "/billing/run", { body: {} });
  assert.equal(response.status, 401, show(response));
});

await step("register billing customer", async () => {
  const response = await req("POST", "/auth/register", {
    body: { email: `billing.${run}@demo.test`, password: "Billing-Pass1!" },
  });
  assert.equal(response.status, 201, show(response));
  customerId = response.json?.data?.user?.id;
  assert.ok(customerId > 0, show(response));
});

await step("admin setup: catalogue, plan, and eligible discount", async () => {
  jar.clear();
  const login = await req("POST", "/auth/login", { body: admin });
  assert.equal(login.status, 200, show(login));

  const product = await req("POST", "/products", {
    body: { name: `Billing item ${run}`, type: "Service", salesPrice: "100.00", costPrice: "0.00" },
  });
  assert.equal(product.status, 201, show(product));
  productId = product.json?.data?.id;

  const tinyProduct = await req("POST", "/products", {
    body: { name: `Rounding item ${run}`, type: "Service", salesPrice: "0.01", costPrice: "0.00" },
  });
  assert.equal(tinyProduct.status, 201, show(tinyProduct));
  tinyProductId = tinyProduct.json?.data?.id;

  const tax = await req("POST", "/taxes", {
    body: { name: `Billing GST ${run}`, rate: "18.00", taxMode: "EXCLUSIVE" },
  });
  assert.equal(tax.status, 201, show(tax));
  taxId = tax.json?.data?.id;
  const roundingTax = await req("POST", "/taxes", {
    body: { name: `Rounding GST ${run}`, rate: "10.00", taxMode: "EXCLUSIVE" },
  });
  assert.equal(roundingTax.status, 201, show(roundingTax));
  roundingTaxId = roundingTax.json?.data?.id;

  const plan = await req("POST", "/plans", {
    body: {
      name: `Billing daily ${run}`,
      price: "100.00",
      billingIntervalUnit: "DAY",
      billingIntervalCount: 1,
      minimumQuantity: 1,
      availableFrom: "2020-01-01",
      availableUntil: "2099-12-31",
    },
  });
  assert.equal(plan.status, 201, show(plan));
  planId = plan.json?.data?.id;

  const discount = await req("POST", "/discounts", {
    body: {
      name: `Billing discount ${run}`,
      discountType: "PERCENTAGE",
      value: "15.00",
      usageLimit: 1,
      scope: "PRODUCTS",
      productIds: [productId],
    },
  });
  assert.equal(discount.status, 201, show(discount));
});

await step("create two active subscriptions due today", async () => {
  for (const fixture of [
    { productId, taxId, key: "main" },
    { productId: tinyProductId, taxId: roundingTaxId, key: "tiny" },
  ]) {
    const created = await req("POST", "/subscriptions", {
      body: {
        customerId,
        planId,
        startDate: today,
        lines: [{ productId: fixture.productId, quantity: 1, taxId: fixture.taxId }],
      },
    });
    assert.equal(created.status, 201, show(created));
    const id = created.json?.data?.id;
    for (const path of ["quotation", "confirm", "activate"]) {
      const transitioned = await req("POST", `/subscriptions/${id}/${path}`, { body: {} });
      assert.equal(transitioned.status, 200, show(transitioned));
    }
    if (fixture.key === "main") subscriptionId = id;
    else tinySubscriptionId = id;
  }
});

await step("billing creates one discounted, taxed invoice and rounds tiny tax correctly", async () => {
  const result = await req("POST", "/billing/run", { body: {} });
  assert.equal(result.status, 200, show(result));
  assert.ok(result.json?.data?.invoices?.length >= 2, show(result));
  const mainInvoice = result.json.data.invoices.find((invoice) => invoice.subscriptionId === subscriptionId);
  const tinyInvoice = result.json.data.invoices.find((invoice) => invoice.subscriptionId === tinySubscriptionId);
  assert.ok(mainInvoice, show(result));
  assert.ok(tinyInvoice, show(result));
  assert.equal(mainInvoice.discountApplied, "15.00");
  assert.equal(mainInvoice.grandTotal, "100.30");
  assert.equal(tinyInvoice.discountApplied, "0.00");
  invoiceId = mainInvoice.invoiceId;
  tinyInvoiceId = tinyInvoice.invoiceId;

  const tinyDetail = await req("GET", `/invoices/${tinyInvoiceId}`);
  assert.equal(tinyDetail.status, 200, show(tinyDetail));
  assert.equal(tinyDetail.json?.data?.lines?.[0]?.taxAmount, "0.00");
  const notOverdue = await req("GET", "/invoices?overdueOnly=false&pageSize=100");
  assert.equal(notOverdue.status, 200, show(notOverdue));
  assert.ok(notOverdue.json?.meta?.total >= 2, show(notOverdue));
  const sendDraft = await req("POST", `/invoices/${invoiceId}/send`, { body: {} });
  assert.equal(sendDraft.status, 409, show(sendDraft));

  const discountList = await req("GET", "/discounts");
  const discount = discountList.json?.data?.find((item) => item.name === `Billing discount ${run}`);
  assert.equal(discount?.usageCount, 1, show(discountList));
});

await step("repeated billing run does not duplicate or re-advance periods", async () => {
  assert.ok(invoiceId, "The first billing run must create an invoice before retrying.");
  const response = await req("POST", "/billing/run", { body: {} });
  assert.equal(response.status, 200, show(response));
  assert.equal(response.json?.data?.invoices?.length, 0, show(response));
  const list = await req("GET", `/invoices?subscriptionId=${subscriptionId}&pageSize=100`);
  assert.equal(list.status, 200, show(list));
  assert.equal(list.json?.data?.length, 1, show(list));
});

await step("customers cannot see draft invoices or finance totals", async () => {
  jar.clear();
  try {
    const login = await req("POST", "/auth/login", {
      body: { email: `billing.${run}@demo.test`, password: "Billing-Pass1!" },
    });
    assert.equal(login.status, 200, show(login));
    const draft = await req("GET", `/invoices/${invoiceId}`);
    assert.equal(draft.status, 404, show(draft));
    const list = await req("GET", "/invoices?status=DRAFT");
    assert.equal(list.status, 200, show(list));
    assert.equal(list.json?.meta?.total, 0, show(list));
    const finance = await req("GET", `/finance/summary?from=${today}&to=${today}`);
    assert.equal(finance.status, 403, show(finance));
    const send = await req("POST", `/invoices/${invoiceId}/send`, { body: {} });
    assert.equal(send.status, 403, show(send));
  } finally {
    jar.clear();
    assert.equal((await req("POST", "/auth/login", { body: admin })).status, 200);
  }
});

await step("draft invoice cancellation is reflected in invoice status", async () => {
  const cancelled = await req("POST", `/invoices/${tinyInvoiceId}/cancel`, {
    body: { reason: "Acceptance test cancellation" },
  });
  assert.equal(cancelled.status, 200, show(cancelled));
  assert.equal(cancelled.json?.data?.status, "CANCELLED");
});

await step("invoice confirmation, partial payment, overpayment rejection, and paid balance", async () => {
  assert.ok(invoiceId, "The billing flow must create an invoice before recording payments.");
  const confirmed = await req("POST", `/invoices/${invoiceId}/confirm`, { body: {} });
  assert.equal(confirmed.status, 200, show(confirmed));
  assert.equal(confirmed.json?.data?.status, "CONFIRMED");

  const partial = await req("POST", `/invoices/${invoiceId}/payments`, {
    body: { method: "bank transfer", amount: "50.00", reference: `partial-${run}` },
  });
  assert.equal(partial.status, 201, show(partial));
  assert.equal(partial.json?.data?.ledger?.outstanding, "50.30");
  assert.equal(partial.json?.data?.ledger?.partiallyPaid, true);

  const cancelWithPayment = await req("POST", `/invoices/${invoiceId}/cancel`, { body: {} });
  assert.equal(cancelWithPayment.status, 409, show(cancelWithPayment));
  assert.equal(cancelWithPayment.json?.error?.code, "CANCEL_HAS_PAYMENTS");

  const overpayment = await req("POST", `/invoices/${invoiceId}/payments`, {
    body: { method: "cash", amount: "50.31" },
  });
  assert.equal(overpayment.status, 409, show(overpayment));
  assert.equal(overpayment.json?.error?.code, "OVERPAYMENT_NOT_ALLOWED");

  const finalPayment = await req("POST", `/invoices/${invoiceId}/payments`, {
    body: { method: "UPI", amount: "50.30" },
  });
  assert.equal(finalPayment.status, 201, show(finalPayment));
  assert.equal(finalPayment.json?.data?.status, "PAID");
  assert.equal(finalPayment.json?.data?.ledger?.outstanding, "0.00");

  const payments = await req("GET", `/payments?invoiceId=${invoiceId}`);
  assert.equal(payments.status, 200, show(payments));
  assert.equal(payments.json?.data?.length, 2, show(payments));
  assert.equal(payments.json?.meta?.total, 2, show(payments));

  const finance = await req("GET", `/finance/summary?from=${today}&to=${today}`);
  assert.equal(finance.status, 200, show(finance));
  assert.ok(finance.json?.data?.activeSubscriptions >= 1, show(finance));
  const inr = finance.json?.data?.currencies?.find((row) => row.currencyCode === "INR");
  assert.ok(inr, show(finance));
  assert.ok(minor(inr.invoiced) >= 10030n, show(finance));
  assert.ok(minor(inr.received) >= 10030n, show(finance));

  jar.clear();
  const customerLogin = await req("POST", "/auth/login", {
    body: { email: `billing.${run}@demo.test`, password: "Billing-Pass1!" },
  });
  assert.equal(customerLogin.status, 200, show(customerLogin));
  const ownInvoice = await req("GET", `/invoices/${invoiceId}`);
  assert.equal(ownInvoice.status, 200, show(ownInvoice));
  assert.equal(ownInvoice.json?.data?.customerId, customerId);
  const cancelledDraft = await req("GET", `/invoices/${tinyInvoiceId}`);
  assert.equal(cancelledDraft.status, 404, show(cancelledDraft));
});

await step("open-ended contract bills every due period (regression: one invoice only)", async () => {
  jar.clear();
  assert.equal((await req("POST", "/auth/login", { body: admin })).status, 200);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const created = await req("POST", "/subscriptions", {
    body: {
      customerId,
      planId,
      startDate: yesterday,
      lines: [{ productId, quantity: 1 }],
    },
  });
  assert.equal(created.status, 201, show(created));
  recurringId = created.json?.data?.id;
  // No contract end was supplied: the contract is open-ended.
  assert.equal(created.json?.data?.expiryDate, null, show(created));
  for (const path of ["quotation", "confirm", "activate"]) {
    const transitioned = await req("POST", `/subscriptions/${recurringId}/${path}`, { body: {} });
    assert.equal(transitioned.status, 200, show(transitioned));
  }

  // Period 1: [yesterday, today). Period 2 becomes due as soon as it is billed,
  // because next_billing_at advances to today — a second run must invoice it.
  const firstRun = await req("POST", "/billing/run", { body: {} });
  assert.equal(firstRun.status, 200, show(firstRun));
  assert.ok(
    firstRun.json?.data?.invoices?.some((invoice) => invoice.subscriptionId === recurringId),
    show(firstRun),
  );
  const secondRun = await req("POST", "/billing/run", { body: {} });
  assert.equal(secondRun.status, 200, show(secondRun));
  assert.ok(
    secondRun.json?.data?.invoices?.some((invoice) => invoice.subscriptionId === recurringId),
    show(secondRun),
  );

  const list = await req("GET", `/invoices?subscriptionId=${recurringId}&pageSize=100`);
  assert.equal(list.status, 200, show(list));
  assert.equal(list.json?.data?.length, 2, show(list));
  const periods = list.json.data
    .map((invoice) => ({ start: invoice.periodStart, end: invoice.periodEnd }))
    .sort((a, b) => (a.start < b.start ? -1 : 1));
  assert.equal(periods[0].start, yesterday, show(periods));
  assert.equal(periods[0].end, periods[1].start, show(periods));

  const detail = await req("GET", `/subscriptions/${recurringId}`);
  assert.equal(detail.status, 200, show(detail));
  assert.equal(detail.json?.data?.status, "ACTIVE");
  assert.ok(detail.json?.data?.nextBillingAt, show(detail));
});

await step("payment accepts a date-only paidAt without failing", async () => {
  assert.ok(recurringId, "The recurring subscription must exist before paying its invoice.");
  const list = await req("GET", `/invoices?subscriptionId=${recurringId}&pageSize=100`);
  assert.equal(list.status, 200, show(list));
  const target = (list.json?.data ?? []).find((invoice) => invoice.status === "DRAFT");
  assert.ok(target, show(list));
  const confirmed = await req("POST", `/invoices/${target.id}/confirm`, { body: {} });
  assert.equal(confirmed.status, 200, show(confirmed));
  // A bare YYYY-MM-DD paidAt previously produced an Invalid Date (HTTP 500).
  const paid = await req("POST", `/invoices/${target.id}/payments`, {
    body: { method: "cash", amount: "0.01", paidAt: today },
  });
  assert.equal(paid.status, 201, show(paid));
  assert.equal(paid.json?.data?.payments?.[0]?.paidAt, `${today} 00:00:00`);
});

await step("monthly and yearly invoices retain their anniversary day after clamping", async () => {
  const startYear = Number(today.slice(0, 4)) - 1;
  const febLast = new Date(Date.UTC(startYear, 2, 0)).getUTCDate();
  const monthlyStart = `${startYear}-01-31`;
  const annualStart = "2016-02-29";
  const cases = [
    { unit: "MONTH", start: monthlyStart },
    { unit: "YEAR", start: annualStart },
  ];
  const ids = {};
  for (const fixture of cases) {
    const plan = await req("POST", "/plans", { body: {
      name: `Billing cadence ${fixture.unit} ${run}`,
      price: "1.00", billingIntervalUnit: fixture.unit, billingIntervalCount: 1,
      minimumQuantity: 1, availableFrom: "2010-01-01", availableUntil: "2099-12-31",
    } });
    assert.equal(plan.status, 201, show(plan));
    const created = await req("POST", "/subscriptions", { body: {
      customerId, planId: plan.json.data.id, startDate: fixture.start,
      lines: [{ productId, quantity: 1 }],
    } });
    assert.equal(created.status, 201, show(created));
    ids[fixture.unit] = created.json.data.id;
    for (const path of ["quotation", "confirm", "activate"]) {
      const transitioned = await req("POST", `/subscriptions/${created.json.data.id}/${path}`, { body: {} });
      assert.equal(transitioned.status, 200, show(transitioned));
    }
  }
  const monthlyEnds = [
    `${startYear}-02-${febLast}`,
    `${startYear}-03-31`,
    `${startYear}-04-30`,
    `${startYear}-05-31`,
  ];
  const annualEnds = ["2017-02-28", "2018-02-28", "2019-02-28", "2020-02-29"];
  let monthStart = monthlyStart;
  let yearStart = annualStart;
  for (let index = 0; index < 4; index += 1) {
    const billed = await req("POST", "/billing/run", { body: {} });
    assert.equal(billed.status, 200, show(billed));
    const month = billed.json?.data?.invoices?.find((invoice) => invoice.subscriptionId === ids.MONTH);
    const year = billed.json?.data?.invoices?.find((invoice) => invoice.subscriptionId === ids.YEAR);
    assert.equal(month?.periodStart, monthStart, show(billed));
    assert.equal(month?.periodEnd, monthlyEnds[index], show(billed));
    assert.equal(year?.periodStart, yearStart, show(billed));
    assert.equal(year?.periodEnd, annualEnds[index], show(billed));
    monthStart = monthlyEnds[index];
    yearStart = annualEnds[index];
  }
});

if (failures > 0) {
  console.error(`\n${failures} billing acceptance step(s) failed.`);
  process.exitCode = 1;
} else {
  console.log("\nAll billing acceptance steps passed.");
}
