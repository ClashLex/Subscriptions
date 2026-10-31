import { env } from "../config/env.js";
import { runBilling } from "../modules/billing/billing.service.js";

/**
 * Optional automatic billing runner.
 *
 * Reuses the same service as the Admin-only manual trigger, so the duplicate
 * guards (uq_invoice_period, the per-subscription row lock, and the
 * advance-on-commit rule) apply unchanged. It is off unless
 * BILLING_RUN_INTERVAL_MINUTES is a positive number, which keeps acceptance
 * suites and local demos deterministic. Runs are recorded in
 * subscription_events with a NULL actor, meaning "system".
 */
export function startBillingScheduler(): () => void {
  const minutes = env.BILLING_RUN_INTERVAL_MINUTES ?? 0;
  if (minutes <= 0) {
    // eslint-disable-next-line no-console
    console.log("[billing] automatic runs disabled (BILLING_RUN_INTERVAL_MINUTES unset)");
    return () => undefined;
  }

  let running = false;
  const timer = setInterval(() => {
    // Never overlap runs: one slow billing pass must not stack another.
    if (running) {
      return;
    }
    running = true;
    void runBilling(null)
      .then((result) => {
        if (result.invoices.length > 0 || result.autoClosed.length > 0) {
          // eslint-disable-next-line no-console
          console.log(
            `[billing] automatic run: ${result.invoices.length} invoice(s), `
              + `${result.autoClosed.length} auto-closed, ${result.skipped.length} skipped`,
          );
        }
      })
      .catch((error: unknown) => {
        // eslint-disable-next-line no-console
        console.error("[billing] automatic run failed:", error instanceof Error ? error.message : error);
      })
      .finally(() => {
        running = false;
      });
  }, minutes * 60 * 1000);

  // Do not hold the process open just for billing.
  timer.unref();

  // eslint-disable-next-line no-console
  console.log(`[billing] automatic runs every ${minutes} minute(s)`);
  return () => clearInterval(timer);
}
