import assert from "node:assert/strict";
import { mergeCurrencyTotals } from "../dist/src/modules/finance/finance.summary.js";

const result = mergeCurrencyTotals(
  [
    { currency_code: "USD", invoiced: "100.10", outstanding: "25.05", overdue: "10.00" },
    { currency_code: "INR", invoiced: "500.00", outstanding: "0.00", overdue: "0.00" },
  ],
  [
    { currency_code: "USD", received: "75.05" },
    { currency_code: "EUR", received: "1.20" },
  ],
);
assert.deepEqual(result, [
  { currencyCode: "EUR", invoiced: "0.00", received: "1.20", outstanding: "0.00", overdue: "0.00" },
  { currencyCode: "INR", invoiced: "500.00", received: "0.00", outstanding: "0.00", overdue: "0.00" },
  { currencyCode: "USD", invoiced: "100.10", received: "75.05", outstanding: "25.05", overdue: "10.00" },
]);
console.log("Finance currency aggregation checks passed.");
