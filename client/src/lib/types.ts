/** API-contract shapes the UI binds to (camelCase DTOs from the server). */

export type Role = "ADMIN" | "STAFF" | "CUSTOMER";

export interface SessionUser {
  id: number;
  email: string;
  role: Role;
}

// ---------------------------------------------------------------------------
// Products & variants (Phase 3)
// ---------------------------------------------------------------------------

export interface ProductVariant {
  id: number;
  productId: number;
  name: string;
  priceAdjustment: string;
  isActive: boolean;
  effectivePrice: string;
}

export interface Product {
  id: number;
  name: string;
  type: string;
  salesPrice: string;
  costPrice: string;
  notes: string | null;
  isActive: boolean;
  variantCount: number;
}

export interface ProductWithVariants extends Product {
  variants?: ProductVariant[];
}

// ---------------------------------------------------------------------------
// Taxes (Phase 3)
// ---------------------------------------------------------------------------

export interface TaxRule {
  id: number;
  name: string;
  rate: string;
  taxMode: "EXCLUSIVE" | "INCLUSIVE";
  isActive: boolean;
}

// ---------------------------------------------------------------------------
// Plans (Phase 3)
// ---------------------------------------------------------------------------

export type BillingIntervalUnit = "DAY" | "WEEK" | "MONTH" | "YEAR";

export interface Plan {
  id: number;
  name: string;
  description: string | null;
  price: string;
  billingIntervalUnit: BillingIntervalUnit;
  billingIntervalCount: number;
  minimumQuantity: number;
  availableFrom: string | null;
  availableUntil: string | null;
  allowPause: boolean;
  allowEarlyClose: boolean;
  allowRenewal: boolean;
  autoClose: boolean;
  isActive: boolean;
}

export const INTERVAL_UNITS: Array<{ value: BillingIntervalUnit; label: string }> = [
  { value: "DAY", label: "Day" },
  { value: "WEEK", label: "Week" },
  { value: "MONTH", label: "Month" },
  { value: "YEAR", label: "Year" },
];

export function intervalLabel(unit: BillingIntervalUnit, count: number): string {
  const label = INTERVAL_UNITS.find((option) => option.value === unit)?.label ?? unit;
  return `${count} \u00D7 ${label}`;
}
