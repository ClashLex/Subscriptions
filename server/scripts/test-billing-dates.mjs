import assert from "node:assert/strict";
import { addIntervalIso } from "../dist/src/lib/dates.js";

assert.equal(addIntervalIso("2024-02-28", "DAY", 1), "2024-02-29");
assert.equal(addIntervalIso("2025-12-29", "WEEK", 1), "2026-01-05");
assert.equal(addIntervalIso("2024-01-31", "MONTH", 1), "2024-02-29");
assert.equal(addIntervalIso("2025-01-31", "MONTH", 1), "2025-02-28");
assert.equal(addIntervalIso("2025-02-28", "MONTH", 1, 31), "2025-03-31");
assert.equal(addIntervalIso("2025-03-31", "MONTH", 1, 31), "2025-04-30");
assert.equal(addIntervalIso("2025-11-30", "MONTH", 2), "2026-01-30");
assert.equal(addIntervalIso("2024-02-29", "YEAR", 1), "2025-02-28");
assert.equal(addIntervalIso("2024-02-29", "YEAR", 4), "2028-02-29");
assert.equal(addIntervalIso("2027-02-28", "YEAR", 1, 29), "2028-02-29");
assert.equal(addIntervalIso("2025-02-05", "MONTH", 1, 5), "2025-03-05");
assert.throws(() => addIntervalIso("2025-01-01", "MONTH", 1, 32), RangeError);
console.log("Billing interval date checks passed.");
