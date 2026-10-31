import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const record = readFileSync(new URL("../../demo-credentials.txt", import.meta.url), "utf8");
function value(label: string): string {
  const row = record.split(/\r?\n/).find((line) => line.startsWith(`${label}: `));
  if (!row) throw new Error(`Demo credential file is missing ${label}. Run npm run seed:demo first.`);
  return row.slice(label.length + 2);
}
function account(label: string): { email: string; password: string } {
  const [email, password] = value(label).split(" / ");
  if (!email || !password) throw new Error(`Invalid ${label} demo account entry.`);
  return { email, password };
}
const firstCustomer = account("Customer");
const secondCustomer = account("Second customer");
const partialInvoiceId = Number(value("Partially paid invoice ID"));
const paidInvoiceId = Number(value("Fully paid invoice ID"));
const dueSubscriptionId = Number(value("Active subscription ready for Run billing"));
const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:5173";

async function signIn(page: Page, email: string, password: string) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function noPageOverflow(page: Page) {
  const widths = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(widths.document, `Page overflows a ${widths.viewport}px viewport`).toBeLessThanOrEqual(widths.viewport + 1);
}

test("rehearse seeded billing, payment, customer isolation, mobile layout, and error states", async ({ page }) => {
  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  expect(adminEmail && adminPassword, "Set seed Admin credentials in .env").toBeTruthy();
  expect(Number.isSafeInteger(dueSubscriptionId) && dueSubscriptionId > 0).toBeTruthy();

  await page.goto("/admin");
  await signIn(page, adminEmail!, adminPassword!);
  await expect(page.getByRole("heading", { name: "Finance overview" })).toBeVisible();
  for (const [path, heading] of [
    ["/admin/products", "Products & variants"],
    ["/admin/plans", "Plans"],
    ["/admin/templates", "Quotation templates"],
    ["/admin/discounts", "Discounts"],
    ["/admin/subscriptions", "Subscriptions"],
  ]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
  }
  const subscriptionResponse = await page.request.get(`${baseURL}/api/v1/subscriptions/${dueSubscriptionId}`);
  expect(subscriptionResponse.status()).toBe(200);
  const subscription = (await subscriptionResponse.json()).data;
  expect(subscription.status).toBe("ACTIVE");
  await expect(page.getByText(subscription.subscriptionNumber, { exact: true })).toBeVisible();

  await page.goto("/admin/invoices");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Run billing" }).click();
  await expect(page.getByText(/Billing run:/)).toBeVisible();
  const invoiceList = async () => {
    const response = await page.request.get(`${baseURL}/api/v1/invoices?subscriptionId=${dueSubscriptionId}`);
    expect(response.status()).toBe(200);
    return (await response.json()).data as Array<{ id: number; invoiceNumber: string; status: string }>;
  };
  const [newInvoice] = await invoiceList();
  expect(newInvoice?.status).toBe("DRAFT");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Run billing" }).click();
  await expect(page.getByText(/Billing run:/)).toBeVisible();
  expect((await invoiceList()).map((invoice) => invoice.id)).toEqual([newInvoice.id]);

  await page.goto(`/admin/invoices?open=${newInvoice.id}`);
  await expect(page.getByRole("heading", { name: newInvoice.invoiceNumber })).toBeVisible();
  await page.getByRole("button", { name: "Confirm invoice" }).click();
  await expect(page.getByRole("heading", { name: "Record payment" })).toBeVisible();
  await page.getByLabel("Method").fill("Bank transfer");
  await page.getByLabel("Amount").fill("10.00");
  await page.getByLabel("Reference").fill("DEMO-REHEARSAL");
  await page.getByRole("button", { name: "Record payment", exact: true }).click();
  await expect(page.getByText("Partially paid", { exact: true })).toBeVisible();

  const detailResponse = await page.request.get(`${baseURL}/api/v1/invoices/${newInvoice.id}`);
  expect(detailResponse.status()).toBe(200);
  const detail = (await detailResponse.json()).data;
  expect(detail.ledger.outstanding).not.toBe("0.00");
  await page.getByLabel("Amount").fill(detail.grandTotal);
  await page.getByRole("button", { name: "Record payment", exact: true }).click();
  await expect(page.getByText(/INVALID_AMOUNT: Enter a positive amount/)).toBeVisible();
  await page.getByLabel("Amount").fill(detail.ledger.outstanding);
  await page.getByRole("button", { name: "Record payment", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Record payment" })).toHaveCount(0);
  const settledResponse = await page.request.get(`${baseURL}/api/v1/invoices/${newInvoice.id}`);
  const settled = (await settledResponse.json()).data;
  expect(settled.status).toBe("PAID");
  expect(settled.ledger.outstanding).toBe("0.00");

  await page.setViewportSize({ width: 390, height: 844 });
  await noPageOverflow(page);
  await page.setViewportSize({ width: 320, height: 700 });
  await noPageOverflow(page);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Finance overview" })).toBeVisible();
  await noPageOverflow(page);
  await expect(page.getByText("Invoiced", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Outstanding", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await page.goto(`/portal?tab=invoices&open=${partialInvoiceId}`);
  await signIn(page, firstCustomer.email, firstCustomer.password);
  await expect(page.getByRole("heading", { name: value("Partially paid invoice") })).toBeVisible();
  await noPageOverflow(page);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/portal/);
  await page.getByRole("button", { name: "Sign out" }).click();

  await page.goto(`/portal?tab=invoices&open=${paidInvoiceId}`);
  await signIn(page, secondCustomer.email, secondCustomer.password);
  await expect(page.getByRole("heading", { name: value("Fully paid invoice") })).toBeVisible();
  await page.goto(`/portal?tab=invoices&open=${partialInvoiceId}`);
  await expect(page.getByText(/INVOICE_NOT_FOUND:/)).toBeVisible();
  await noPageOverflow(page);
  console.log("Seeded demo rehearsal passed across Admin, two Customers, mobile layout, and payment errors.");
});
