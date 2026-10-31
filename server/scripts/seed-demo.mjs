/** Creates a fresh fictional demo flow through the running API. Never use against production. */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";

if (process.env.NODE_ENV === "production") throw new Error("Demo seeding is disabled in production.");
assert.ok(process.env.SEED_ADMIN_EMAIL && process.env.SEED_ADMIN_PASSWORD, "Seed Admin credentials are required.");
const base = `http://127.0.0.1:${process.env.PORT ?? 4000}/api/v1`;
const suffix = Date.now().toString(36);
const today = new Date().toISOString().slice(0, 10);
const customerEmail = `demo.customer.${suffix}@brightloop.test`;
const secondCustomerEmail = `demo.customer.b.${suffix}@brightloop.test`;
const staffEmail = `demo.staff.${suffix}@brightloop.test`;
const customerPassword = `${randomBytes(12).toString("base64url")}aA!`;
const secondCustomerPassword = `${randomBytes(12).toString("base64url")}aA!`;
const staffPassword = `${randomBytes(12).toString("base64url")}aA!`;

async function post(path, body, cookie) {
  const response = await fetch(`${base}/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  assert.ok(response.ok, `${path}: ${response.status} ${JSON.stringify(json.error)}`);
  return { data: json.data, cookie: response.headers.getSetCookie()[0]?.split(";")[0] };
}

const customer = (await post("auth/register", {
  email: customerEmail, password: customerPassword, displayName: "Brightloop Demo Customer",
})).data.user;
const secondCustomer = (await post("auth/register", {
  email: secondCustomerEmail, password: secondCustomerPassword, displayName: "Brightloop Second Customer",
})).data.user;
const login = await post("auth/login", {
  email: process.env.SEED_ADMIN_EMAIL, password: process.env.SEED_ADMIN_PASSWORD,
});
assert.ok(login.cookie, "Admin session cookie missing.");
const cookie = login.cookie;
await post("users/staff", { email: staffEmail, password: staffPassword, displayName: "Brightloop Demo Staff" }, cookie);
const product = (await post("products", {
  name: `Brightloop Cloud ${suffix}`, type: "Service", salesPrice: "100.00", costPrice: "20.00",
}, cookie)).data;
const variant = (await post(`products/${product.id}/variants`, {
  name: `Premium support ${suffix}`, priceAdjustment: "25.00",
}, cookie)).data;
const tax = (await post("taxes", {
  name: `Demo GST ${suffix}`, rate: "18.00", taxMode: "EXCLUSIVE",
}, cookie)).data;
const plan = (await post("plans", {
  name: `Brightloop Monthly ${suffix}`, price: "999.00", billingIntervalUnit: "MONTH",
  billingIntervalCount: 1, minimumQuantity: 1, availableFrom: "2020-01-01", availableUntil: "2099-12-31",
}, cookie)).data;
const weeklyPlan = (await post("plans", {
  name: `Brightloop Weekly ${suffix}`, price: "249.00", billingIntervalUnit: "WEEK",
  billingIntervalCount: 1, minimumQuantity: 1, availableFrom: "2020-01-01", availableUntil: "2099-12-31",
}, cookie)).data;
const template = (await post("quotation-templates", {
  name: `Premium launch ${suffix}`, validityDays: 10, defaultPlanId: plan.id,
  items: [{ productId: product.id, variantId: variant.id, quantity: 1, taxId: tax.id }],
}, cookie)).data;
await post("discounts", {
  name: `Demo loyalty ${suffix}`, discountType: "PERCENTAGE", value: "10.00",
  scope: "PRODUCTS", productIds: [product.id], usageLimit: 2,
}, cookie);

async function activate({ customerId = customer.id, planId = plan.id, variantId } = {}) {
  const subscription = (await post("subscriptions", {
    customerId, planId, startDate: today,
    lines: [{ productId: product.id, ...(variantId ? { variantId } : {}), quantity: 1, taxId: tax.id }],
  }, cookie)).data;
  for (const action of ["quotation", "confirm", "activate"]) {
    await post(`subscriptions/${subscription.id}/${action}`, {}, cookie);
  }
  return subscription.id;
}

const firstId = await activate();
const run = (await post("billing/run", {}, cookie)).data;
const firstInvoice = run.invoices.find((invoice) => invoice.subscriptionId === firstId);
assert.ok(firstInvoice, "The first demo subscription was not invoiced.");
const repeatRun = (await post("billing/run", {}, cookie)).data;
assert.ok(!repeatRun.invoices.some((invoice) => invoice.subscriptionId === firstId), "A repeated billing run duplicated the first invoice.");
await post(`invoices/${firstInvoice.invoiceId}/confirm`, {}, cookie);
await post(`invoices/${firstInvoice.invoiceId}/payments`, {
  method: "bank transfer", amount: "20.00", reference: `DEMO-${suffix}`,
}, cookie);
const paidSubscriptionId = await activate({
  customerId: secondCustomer.id, planId: weeklyPlan.id, variantId: variant.id,
});
const paidRun = (await post("billing/run", {}, cookie)).data;
const paidInvoice = paidRun.invoices.find((invoice) => invoice.subscriptionId === paidSubscriptionId);
assert.ok(paidInvoice, "The second demo subscription was not invoiced.");
const confirmed = (await post(`invoices/${paidInvoice.invoiceId}/confirm`, {}, cookie)).data;
const paid = (await post(`invoices/${paidInvoice.invoiceId}/payments`, {
  method: "UPI", amount: confirmed.grandTotal, reference: `PAID-${suffix}`,
}, cookie)).data;
assert.equal(paid.status, "PAID", "The second demo invoice was not fully paid.");
const dueId = await activate();

const firstCustomerSession = await post("auth/login", { email: customerEmail, password: customerPassword });
const secondCustomerSession = await post("auth/login", { email: secondCustomerEmail, password: secondCustomerPassword });
for (const [session, ownId, otherId] of [
  [firstCustomerSession, firstInvoice.invoiceId, paidInvoice.invoiceId],
  [secondCustomerSession, paidInvoice.invoiceId, firstInvoice.invoiceId],
]) {
  const own = await fetch(`${base}/invoices/${ownId}`, { headers: { cookie: session.cookie } });
  assert.equal(own.status, 200, "A demo customer cannot open their own invoice.");
  const foreign = await fetch(`${base}/invoices/${otherId}`, { headers: { cookie: session.cookie } });
  assert.equal(foreign.status, 404, "A demo customer can open another customer's invoice.");
}

const credentialFile = new URL("../../demo-credentials.txt", import.meta.url);
await writeFile(credentialFile, [
  "Local Brightloop demo records (keep this file private)",
  `Demo marker: ${suffix}`,
  `Customer: ${customerEmail} / ${customerPassword}`,
  `Second customer: ${secondCustomerEmail} / ${secondCustomerPassword}`,
  `Staff: ${staffEmail} / ${staffPassword}`,
  `Product ID: ${product.id}`,
  `Variant ID: ${variant.id}`,
  `Monthly plan ID: ${plan.id}`,
  `Weekly plan ID: ${weeklyPlan.id}`,
  `Quotation template ID: ${template.id}`,
  `Partially paid invoice: ${firstInvoice.invoiceNumber}`,
  `Partially paid invoice ID: ${firstInvoice.invoiceId}`,
  `Fully paid invoice: ${paidInvoice.invoiceNumber}`,
  `Fully paid invoice ID: ${paidInvoice.invoiceId}`,
  `Active subscription ready for Run billing: ${dueId}`,
  "Sign in as Admin to show Overview, Invoices & billing, Discounts, and Payments.",
  "",
].join("\n"), { mode: 0o600 });
console.log("Demo records created in the local database. Credentials and record IDs were saved to the ignored demo-credentials.txt file.");
