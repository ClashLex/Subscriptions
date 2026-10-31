import { expect, request, test, type APIRequestContext } from "@playwright/test";

const admin = { email: process.env.SEED_ADMIN_EMAIL, password: process.env.SEED_ADMIN_PASSWORD };
const customerPassword = "Portal-Pass1!";
const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:5173";
const ignoreHTTPSErrors = process.env.E2E_IGNORE_HTTPS_ERRORS === "1";

async function post<T>(api: APIRequestContext, path: string, body: unknown): Promise<T> {
  const response = await api.post(path, { data: body });
  expect(response.ok(), `${path}: ${response.status()} ${await response.text()}`).toBeTruthy();
  const json = await response.json();
  return json.data as T;
}

test("admin and customer can follow an invoice through billing and payment", async ({ page }) => {
  expect(admin.email && admin.password, "Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in .env").toBeTruthy();
  const suffix = Date.now().toString(36);
  const customerEmail = `browser.${suffix}@demo.test`;
  const anonymousApi = await request.newContext({ baseURL: `${baseURL}/api/v1/`, ignoreHTTPSErrors });
  const adminApi = await request.newContext({ baseURL: `${baseURL}/api/v1/`, ignoreHTTPSErrors });
  try {
    const customer = await post<{ user: { id: number } }>(anonymousApi, "auth/register", {
      email: customerEmail, password: customerPassword,
    });
    await post(adminApi, "auth/login", admin);
    const product = await post<{ id: number }>(adminApi, "products", {
      name: `Browser item ${suffix}`, type: "Service", salesPrice: "100.00", costPrice: "0.00",
    });
    const plan = await post<{ id: number }>(adminApi, "plans", {
      name: `Browser plan ${suffix}`, price: "999.00", billingIntervalUnit: "MONTH",
      billingIntervalCount: 1, minimumQuantity: 1, availableFrom: "2020-01-01", availableUntil: "2099-12-31",
    });
    const today = new Date().toISOString().slice(0, 10);
    const subscription = await post<{ id: number }>(adminApi, "subscriptions", {
      customerId: customer.user.id, planId: plan.id, startDate: today,
      lines: [{ productId: product.id, quantity: 1 }],
    });
    for (const action of ["quotation", "confirm", "activate"]) {
      await post(adminApi, `subscriptions/${subscription.id}/${action}`, {});
    }
    const run = await post<{ invoices: Array<{ invoiceId: number; invoiceNumber: string; subscriptionId: number }> }>(adminApi, "billing/run", {});
    const billed = run.invoices.find((row) => row.subscriptionId === subscription.id);
    expect(billed).toBeDefined();
    const invoiceId = billed!.invoiceId;
    await post(adminApi, `invoices/${invoiceId}/confirm`, {});
    await post(adminApi, `invoices/${invoiceId}/payments`, { method: "bank transfer", amount: "20.00", reference: `browser-${suffix}` });

    await page.goto("/admin");
    await page.getByLabel("Email").fill(admin.email!);
    await page.getByLabel("Password").fill(admin.password!);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { name: "Finance overview" })).toBeVisible();
    if (baseURL.startsWith("https://")) {
      const sessionCookie = (await page.context().cookies()).find((cookie) => cookie.name === "subscriptions.sid");
      expect(sessionCookie?.secure, "Production session cookie must be Secure").toBe(true);
    }
    await page.goto(`/admin/invoices?open=${invoiceId}`);
    await expect(page.getByRole("heading", { name: billed!.invoiceNumber })).toBeVisible();
    await expect(page.getByText("₹80.00")).toBeVisible();
    if (process.env.E2E_SMTP_CAPTURE === "1") {
      await page.getByRole("button", { name: "Email customer" }).click();
      await expect(page.getByText(`Invoice email sent to ${customerEmail}.`)).toBeVisible();
    }
    const [printPage] = await Promise.all([
      page.waitForEvent("popup"),
      page.getByRole("link", { name: "Print / save PDF" }).click(),
    ]);
    await expect(printPage.getByRole("heading", { name: "Invoice", exact: true })).toBeVisible();
    await expect(printPage.getByText(billed!.invoiceNumber)).toBeVisible();
    await printPage.emulateMedia({ media: "print" });
    await expect(printPage.getByRole("button", { name: "Print / save PDF" })).toBeHidden();
    const pdf = await printPage.pdf({ format: "A4" });
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(pdf.length).toBeGreaterThan(1_000);
    await printPage.close();

    await page.context().clearCookies();
    await page.goto(`/portal?tab=invoices&open=${invoiceId}`);
    await page.getByLabel("Email").fill(customerEmail);
    await page.getByLabel("Password").fill(customerPassword);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { name: "My invoices" })).toBeVisible();
    await expect(page.getByRole("heading", { name: billed!.invoiceNumber })).toBeVisible();
    await page.getByRole("button", { name: "Close" }).click();
    await page.getByRole("button", { name: "payments", exact: true }).click();
    await expect(page.getByRole("heading", { name: "My payments" })).toBeVisible();
    await expect(page.getByText(`browser-${suffix}`)).toBeVisible();

    const staffEmail = `browser.staff.${suffix}@demo.test`;
    await post(adminApi, "users/staff", {
      email: staffEmail, password: customerPassword, displayName: "Browser Staff",
    });
    await page.context().clearCookies();
    await page.goto("/login");
    await page.getByLabel("Email").fill(staffEmail);
    await page.getByLabel("Password").fill(customerPassword);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { name: "Finance overview" })).toBeVisible();
    await page.goto("/admin/invoices");
    await expect(page.getByRole("heading", { name: "Invoices & billing" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Run billing" })).toHaveCount(0);
    await page.goto("/admin/discounts");
    await expect(page.getByRole("heading", { name: "Discounts" })).toBeVisible();
    await expect(page.getByRole("button", { name: "New discount" })).toHaveCount(0);
  } finally {
    await anonymousApi.dispose();
    await adminApi.dispose();
  }
});
