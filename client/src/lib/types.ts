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

// ---------------------------------------------------------------------------
// Quotation templates & subscriptions (Phase 4)
// ---------------------------------------------------------------------------

export interface CustomerOption {
  id: number;
  email: string;
  displayName: string | null;
  companyName: string | null;
  isActive: boolean;
}

export interface TemplateItem {
  productId: number;
  variantId: number | null;
  productName: string;
  variantName: string | null;
  quantity: number;
  unitPrice: string;
  taxId: number | null;
  taxName: string | null;
}

export interface QuotationTemplate {
  id: number;
  name: string;
  validityDays: number;
  defaultPlanId: number | null;
  defaultPlanName: string | null;
  items: TemplateItem[];
}

export type SubscriptionStatus =
  | "DRAFT"
  | "QUOTATION"
  | "CONFIRMED"
  | "ACTIVE"
  | "PAUSED"
  | "CLOSED";

export interface SubscriptionListItem {
  id: number;
  subscriptionNumber: string;
  customerId: number;
  customerEmail: string;
  planId: number;
  planName: string;
  status: SubscriptionStatus;
  startDate: string | null;
  expiryDate: string | null;
  nextBillingAt: string | null;
  previousSubscriptionId: number | null;
}

export interface SubscriptionLine {
  id: number;
  productId: number | null;
  variantId: number | null;
  description: string;
  quantity: number;
  unitPrice: string;
  lineAmount: string;
  taxId: number | null;
  taxName: string | null;
  taxRate: string | null;
  taxMode: "EXCLUSIVE" | "INCLUSIVE" | null;
}

export interface SubscriptionEvent {
  id: number;
  eventType: string;
  fromStatus: string | null;
  toStatus: string | null;
  reason: string | null;
  actorEmail: string | null;
  createdAt: string;
}

export interface SubscriptionTotals {
  subtotal: string;
  taxTotal: string;
  total: string;
}

export interface SubscriptionDetail {
  id: number;
  subscriptionNumber: string;
  customerId: number;
  customerEmail: string;
  planId: number;
  planName: string;
  billingIntervalUnit: BillingIntervalUnit;
  billingIntervalCount: number;
  templateId: number | null;
  status: SubscriptionStatus;
  startDate: string | null;
  expiryDate: string | null;
  quotationValidUntil: string | null;
  paymentTermsDays: number;
  nextBillingAt: string | null;
  previousSubscriptionId: number | null;
  pausedAt: string | null;
  closedAt: string | null;
  allowPause: boolean;
  allowEarlyClose: boolean;
  allowRenewal: boolean;
  lines: SubscriptionLine[];
  events: SubscriptionEvent[];
  totals: SubscriptionTotals;
}

export const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  DRAFT: "Draft",
  QUOTATION: "Quotation",
  CONFIRMED: "Confirmed",
  ACTIVE: "Active",
  PAUSED: "Paused",
  CLOSED: "Closed",
};
