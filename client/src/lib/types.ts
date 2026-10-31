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
  price: string; // Catalogue reference price; invoices use subscription line prices.
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

// Billing and finance API shapes. Monetary values remain decimal strings.
export type InvoiceStatus = "DRAFT" | "CONFIRMED" | "PAID" | "CANCELLED";

export interface InvoiceListItem {
  id: number;
  invoiceNumber: string;
  subscriptionId: number;
  subscriptionNumber: string;
  customerId: number;
  customerEmail: string;
  periodStart: string;
  periodEnd: string;
  issueDate: string;
  dueDate: string;
  currencyCode: string;
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  grandTotal: string;
  status: InvoiceStatus;
}

export interface InvoiceLine {
  id: number;
  productId: number | null;
  variantId: number | null;
  description: string;
  quantity: number;
  unitPrice: string;
  lineSubtotal: string;
  discountAmount: string;
  discountRuleId: number | null;
  taxName: string | null;
  taxRate: string | null;
  taxMode: "EXCLUSIVE" | "INCLUSIVE" | null;
  taxAmount: string;
  lineTotal: string;
}

export interface PaymentListItem {
  id: number;
  invoiceId: number;
  invoiceNumber: string;
  customerId: number;
  customerEmail: string;
  method: string;
  amount: string;
  paidAt: string;
  note: string | null;
  reference: string | null;
  status: string;
}

export interface InvoicePayment extends Omit<PaymentListItem, "invoiceId" | "invoiceNumber" | "customerId" | "customerEmail"> {
  recordedByEmail: string | null;
}

export interface InvoiceDetail extends Omit<InvoiceListItem, "subscriptionNumber" | "customerEmail"> {
  subscriptionNumber: string | null;
  customerEmail: string | null;
  confirmedAt: string | null;
  cancelledAt: string | null;
  lines: InvoiceLine[];
  payments: InvoicePayment[];
  ledger: { paidTotal: string; outstanding: string; partiallyPaid: boolean; overdue: boolean };
}

export interface BillingRunResult {
  scanned: number;
  invoices: Array<{ invoiceId: number; invoiceNumber: string; subscriptionId: number; subscriptionNumber: string; grandTotal: string }>;
  skipped: Array<{ subscriptionId: number; subscriptionNumber: string; reason: string }>;
  autoClosed: Array<{ subscriptionId: number; subscriptionNumber: string }>;
  failed: Array<{ subscriptionId: number; subscriptionNumber: string; operation: string }>;
}

export interface DiscountRule {
  id: number;
  name: string;
  discountType: "FIXED" | "PERCENTAGE";
  value: string;
  minimumPurchase: string | null;
  minimumQuantity: number | null;
  startsAt: string | null;
  endsAt: string | null;
  usageLimit: number | null;
  usageCount: number;
  scope: "PRODUCTS" | "SUBSCRIPTION";
  isActive: boolean;
  productIds: number[];
  createdBy: number | null;
  createdAt: string;
}
