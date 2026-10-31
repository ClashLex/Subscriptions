import { useCallback, useEffect, useState } from "react";
import { asApiError, formatMoney, list, request, type ApiError, type PageMeta } from "../../lib/api.js";
import {
  STATUS_LABELS,
  intervalLabel,
  type CustomerOption,
  type Plan,
  type QuotationTemplate,
  type SubscriptionDetail,
  type SubscriptionListItem,
  type SubscriptionStatus,
} from "../../lib/types.js";
import {
  Badge,
  Button,
  ErrorBanner,
  Field,
  Modal,
  PageHeading,
  Select,
  TableShell,
  TextInput,
} from "../../ui/components.js";
import { ItemsEditor, type ItemRow } from "../../ui/ItemsEditor.js";

const STATUS_FILTERS: Array<{ value: SubscriptionStatus | ""; label: string }> = [
  { value: "", label: "All statuses" },
  ...(Object.keys(STATUS_LABELS) as SubscriptionStatus[]).map((status) => ({
    value: status,
    label: STATUS_LABELS[status],
  })),
];

const PAGE_SIZE = 25;

export function SubscriptionsPage() {
  const [rows, setRows] = useState<SubscriptionListItem[] | null>(null);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [status, setStatus] = useState<SubscriptionStatus | "">("");
  const [customerId, setCustomerId] = useState<number | "">("");
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [error, setError] = useState<ApiError | null>(null);
  const [creator, setCreator] = useState<{ open: boolean; error?: ApiError } | null>(null);
  const [detail, setDetail] = useState<SubscriptionDetail | null>(null);
  const [detailError, setDetailError] = useState<ApiError | null>(null);

  const refresh = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: "1", pageSize: String(PAGE_SIZE) });
      if (status !== "") {
        params.set("status", status);
      }
      if (customerId !== "") {
        params.set("customerId", String(customerId));
      }
      // Customers must NOT be able to raise their scope by query params — the
      // server ignores clientId filters for them; this page is staff-only.
      const response = await list<SubscriptionListItem>(`/subscriptions?${params.toString()}`);
      setRows(response.data);
      setMeta(response.meta);
      setError(null);
    } catch (caught) {
      setError(asApiError(caught));
    }
  }, [status, customerId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    void list<CustomerOption>("/users/customers")
      .then((response) => setCustomers(response.data))
      .catch(() => undefined);
  }, []);

  async function openDetail(id: number) {
    setDetail(null);
    setDetailError(null);
    try {
      setDetail(await request<SubscriptionDetail>(`/subscriptions/${id}`));
    } catch (caught) {
      setDetailError(asApiError(caught));
    }
  }

  function statusTone(status: SubscriptionStatus): "green" | "amber" | "slate" | "indigo" {
    if (status === "ACTIVE") return "green";
    if (status === "PAUSED") return "amber";
    if (status === "CLOSED") return "slate";
    return "indigo";
  }

  return (
    <div>
      <PageHeading
        title="Subscriptions"
        subtitle="Draft → quotation → confirmation → activation; pause/resume/close/renew per the plan's policy."
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Select value={status} onChange={(event) => setStatus(event.target.value as SubscriptionStatus | "")} className="w-44">
            {STATUS_FILTERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <Select
            value={customerId}
            onChange={(event) => setCustomerId(event.target.value === "" ? "" : Number(event.target.value))}
            className="w-56"
          >
            <option value="">All customers</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.displayName ?? customer.email}
                {!customer.isActive ? " (inactive)" : ""}
              </option>
            ))}
          </Select>
        </div>
        <Button onClick={() => setCreator({ open: true })}>New subscription</Button>
      </div>

      <ErrorBanner error={error} />
      <TableShell
        head={
          <tr>
            <th className="px-3 py-2">Number</th>
            <th className="px-3 py-2">Customer</th>
            <th className="px-3 py-2">Plan</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Start / expiry</th>
            <th className="px-3 py-2">Next billing</th>
            <th className="px-3 py-2 text-right">Actions</th>
          </tr>
        }
      >
        {rows === null ? (
          <tr>
            <td colSpan={7} className="px-3 py-6 text-center text-slate-500">{"Loading…"}</td>
          </tr>
        ) : rows.length === 0 ? (
          <tr>
            <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
              No subscriptions match the current filters.
            </td>
          </tr>
        ) : (
          rows.map((row) => (
            <tr key={row.id}>
              <td className="px-3 py-2 font-mono text-xs font-medium text-indigo-700">{row.subscriptionNumber}</td>
              <td className="px-3 py-2 text-slate-600">{row.customerEmail}</td>
              <td className="px-3 py-2 text-slate-700">{row.planName}</td>
              <td className="px-3 py-2">
                <Badge tone={statusTone(row.status)}>{STATUS_LABELS[row.status]}</Badge>
              </td>
              <td className="px-3 py-2 text-xs text-slate-600">
                {row.startDate ?? "\u221E"} {"\u2192"} {row.expiryDate ?? "\u221E"}
              </td>
              <td className="px-3 py-2 text-xs text-slate-600">{row.nextBillingAt?.slice(0, 10) ?? "—"}</td>
              <td className="px-3 py-2 text-right">
                <Button variant="secondary" onClick={() => void openDetail(row.id)}>
                  Open
                </Button>
              </td>
            </tr>
          ))
        )}
      </TableShell>
      {meta !== null && meta.total >= 0 ? (
        <p className="mt-2 text-xs text-slate-500">
          {meta.total} subscription(s) — first page shown.
        </p>
      ) : null}

      <SubscriptionCreator
        state={creator}
        customers={customers}
        onDone={() => {
          setCreator(null);
          void refresh();
        }}
        onClose={() => setCreator(null)}
        onOpenDetail={(id) => void openDetail(id)}
      />

      <SubscriptionDetailModal
        detail={detail}
        error={detailError}
        onClose={() => setDetail(null)}
        onRefresh={(updated) => setDetail(updated)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create modal
// ---------------------------------------------------------------------------

interface CreateDraft {
  customerId: number | null;
  planId: number | null;
  templateId: number | null;
  startDate: string;
  paymentTermsDays: string;
  items: ItemRow[];
}

function todayIsoLocal(): string {
  return new Date().toISOString().slice(0, 10);
}

function SubscriptionCreator({
  state,
  customers,
  onDone,
  onClose,
  onOpenDetail,
}: {
  state: { open: boolean; error?: ApiError } | null;
  customers: CustomerOption[];
  onDone: () => void;
  onClose: () => void;
  onOpenDetail: (id: number) => void;
}) {
  const [draft, setDraft] = useState<CreateDraft>({
    customerId: null,
    planId: null,
    templateId: null,
    startDate: todayIsoLocal(),
    paymentTermsDays: "0",
    items: [{ productId: null, variantId: null, quantity: "1", taxId: null }],
  });
  const [plans, setPlans] = useState<Plan[]>([]);
  const [templates, setTemplates] = useState<QuotationTemplate[]>([]);
  const [taxes, setTaxes] = useState<Array<{ id: number; name: string; taxMode: string }>>([]);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (state?.open !== true) {
      return;
    }
    void list<Plan>("/plans?pageSize=100")
      .then((response) => setPlans(response.data))
      .catch(() => undefined);
    void list<QuotationTemplate>("/quotation-templates?pageSize=100")
      .then((response) => setTemplates(response.data))
      .catch(() => undefined);
    void request<Array<{ id: number; name: string; taxMode: string }>>("/taxes")
      .then((response) => setTaxes(response))
      .catch(() => undefined);
  }, [state?.open]);

  async function submit() {
    if (state === null) {
      return;
    }
    setError(null);
    if (draft.customerId === null || draft.planId === null) {
      setError(asApiError(new Error("Choose a customer and a plan.")));
      return;
    }
    const body: Record<string, unknown> = {
      customerId: draft.customerId,
      planId: draft.planId,
      startDate: draft.startDate || undefined,
      paymentTermsDays: Math.max(Number.parseInt(draft.paymentTermsDays, 10) || 0, 0),
    };
    if (draft.templateId !== null) {
      body.templateId = draft.templateId;
    } else {
      const lines = draft.items
        .filter((row) => row.productId !== null)
        .map((row) => ({
          productId: Number(row.productId),
          variantId: row.variantId ?? undefined,
          quantity: Math.max(Number.parseInt(row.quantity, 10) || 1, 1),
          taxId: row.taxId ?? undefined,
        }));
      if (lines.length === 0) {
        setError(asApiError(new Error("Add at least one line or choose a template.")));
        return;
      }
      body.lines = lines;
    }
    setBusy(true);
    try {
      const response = await request<{ id: number }>("/subscriptions", { method: "POST", body });
      onDone();
      onOpenDetail(response.id);
    } catch (caught) {
      setError(asApiError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={state?.open === true} title="New subscription (draft)" onClose={onClose} wide>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <ErrorBanner error={error ?? state?.error ?? null} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Customer">
            <Select
              required
              value={draft.customerId ?? ""}
              onChange={(event) =>
                setDraft({ ...draft, customerId: event.target.value === "" ? null : Number(event.target.value) })
              }
            >
              <option value="">Choose a customer…</option>
              {customers
                .filter((customer) => customer.isActive)
                .map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.displayName ? `${customer.displayName} — ` : ""}
                    {customer.email}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Plan">
            <Select
              required
              value={draft.planId ?? ""}
              onChange={(event) =>
                setDraft({ ...draft, planId: event.target.value === "" ? null : Number(event.target.value) })
              }
            >
              <option value="">Choose a plan…</option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name} — {formatMoney(plan.price)} / {intervalLabel(plan.billingIntervalUnit, plan.billingIntervalCount)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Start date (today if blank)">
            <TextInput
              value={draft.startDate}
              onChange={(event) => setDraft({ ...draft, startDate: event.target.value })}
            />
          </Field>
          <Field label="Payment terms (days)">
            <TextInput
              inputMode="numeric"
              value={draft.paymentTermsDays}
              onChange={(event) => setDraft({ ...draft, paymentTermsDays: event.target.value })}
            />
          </Field>
          <Field label="From template (optional)">
            <Select
              value={draft.templateId ?? ""}
              onChange={(event) =>
                setDraft({ ...draft, templateId: event.target.value === "" ? null : Number(event.target.value) })
              }
            >
              <option value="">None — direct lines</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name} (validity {template.validityDays}d)
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {draft.templateId === null ? (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Line items</p>
            <ItemsEditor
              rows={draft.items}
              onRowsChange={(items) => setDraft({ ...draft, items })}
              taxes={taxes}
            />
          </div>
        ) : (
          <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Lines will copy from the selected template with its snapshot prices.
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Creating…" : "Create draft"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Detail modal with lifecycle actions
// ---------------------------------------------------------------------------

function SubscriptionDetailModal({
  detail,
  error,
  onClose,
  onRefresh,
}: {
  detail: SubscriptionDetail | null;
  error: ApiError | null;
  onClose: () => void;
  onRefresh: (detail: SubscriptionDetail) => void;
}) {
  const [reason, setReason] = useState("");
  const [validityDaysDraft, setValidityDaysDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<ApiError | null>(null);
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState<{ startDate: string; paymentTermsDays: string }>({
    startDate: "",
    paymentTermsDays: "0",
  });

  useEffect(() => {
    setReason("");
    setValidityDaysDraft("");
    setActionError(null);
    setEditing(false);
    if (detail !== null) {
      setEditDraft({
        startDate: detail.startDate ?? "",
        paymentTermsDays: String(detail.paymentTermsDays),
      });
    }
  }, [detail]);

  async function act(action: string, body: Record<string, unknown> = {}, method = "POST") {
    if (detail === null) {
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      const response = await request<SubscriptionDetail>(`/subscriptions/${detail.id}/${action}`, {
        method,
        body,
      });
      onRefresh(response);
    } catch (caught) {
      setActionError(asApiError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    if (detail === null) {
      return;
    }
    await act("edit", {
      startDate: editDraft.startDate === "" ? undefined : editDraft.startDate,
      paymentTermsDays: Math.max(Number.parseInt(editDraft.paymentTermsDays, 10) || 0, 0),
    }, "PATCH");
    setEditing(false);
  }

  function eventTone(eventType: string): "green" | "indigo" | "amber" | "slate" {
    if (eventType === "ACTIVATED" || eventType === "RESUMED") return "green";
    if (eventType === "CONFIRMED" || eventType === "SUBMITTED_QUOTATION") return "indigo";
    if (eventType === "PAUSED" || eventType.includes("OVERRIDE")) return "amber";
    return "slate";
  }

  const canEdit = detail !== null && (detail.status === "DRAFT" || detail.status === "QUOTATION");

  return (
    <Modal open={detail !== null} wide title={detail !== null ? `Subscription ${detail.subscriptionNumber}` : ""} onClose={onClose}>
      {error ? (
        <ErrorBanner error={error} />
      ) : detail === null ? (
        <p className="text-sm text-slate-500">{"Loading…"}</p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="indigo">{STATUS_LABELS[detail.status]}</Badge>
            <span className="text-sm text-slate-600">{detail.customerEmail}</span>
            <span className="text-sm text-slate-500">
              {detail.planName} {"\u00B7"} {intervalLabel(detail.billingIntervalUnit, detail.billingIntervalCount)}
            </span>
            {detail.templateId !== null ? <Badge tone="slate">From template</Badge> : null}
            {detail.previousSubscriptionId !== null ? (
              <Badge tone="slate">Renewal of #{detail.previousSubscriptionId}</Badge>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm text-slate-600 sm:grid-cols-3">
            <p>
              <span className="block text-xs uppercase tracking-wide text-slate-400">Start</span>
              {detail.startDate ?? "—"}
            </p>
            <p>
              <span className="block text-xs uppercase tracking-wide text-slate-400">Quotation / contract end</span>
              {detail.expiryDate ?? "—"}
            </p>
            <p>
              <span className="block text-xs uppercase tracking-wide text-slate-400">Next billing</span>
              {detail.nextBillingAt?.slice(0, 10) ?? "—"}
            </p>
            <p>
              <span className="block text-xs uppercase tracking-wide text-slate-400">Payment terms</span>
              {detail.paymentTermsDays} day(s)
            </p>
            <p>
              <span className="block text-xs uppercase tracking-wide text-slate-400">Paused at</span>
              {detail.pausedAt ?? "—"}
            </p>
            <p>
              <span className="block text-xs uppercase tracking-wide text-slate-400">Closed at</span>
              {detail.closedAt ?? "—"}
            </p>
          </div>

          <div className="overflow-hidden rounded-lg border border-slate-200 text-sm">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-1.5">Line</th>
                  <th className="px-3 py-1.5">Qty</th>
                  <th className="px-3 py-1.5">Unit</th>
                  <th className="px-3 py-1.5">Tax</th>
                  <th className="px-3 py-1.5 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {detail.lines.map((line) => (
                  <tr key={line.id}>
                    <td className="px-3 py-1.5">{line.description}</td>
                    <td className="px-3 py-1.5">{line.quantity}</td>
                    <td className="px-3 py-1.5">{formatMoney(line.unitPrice)}</td>
                    <td className="px-3 py-1.5 text-xs text-slate-500">
                      {line.taxName === null ? "—" : `${line.taxName} ${line.taxRate}% (${line.taxMode?.toLowerCase()})`}
                    </td>
                    <td className="px-3 py-1.5 text-right">{formatMoney(line.lineAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap justify-end gap-x-6 text-sm">
            <span className="text-slate-500">
              Subtotal <span className="font-semibold text-slate-900">{formatMoney(detail.totals.subtotal)}</span>
            </span>
            <span className="text-slate-500">
              Tax total <span className="font-semibold text-slate-900">{formatMoney(detail.totals.taxTotal)}</span>
            </span>
            <span className="text-slate-500">
              Total <span className="font-semibold text-slate-900">{formatMoney(detail.totals.total)}</span>
            </span>
          </div>

          <div className="rounded-lg border border-slate-200 p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <TextInput
                placeholder="Reason (optional)"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className="w-56"
              />
              {canEdit ? (
                editing ? (
                  <>
                    <TextInput
                      className="w-32"
                      value={editDraft.startDate}
                      onChange={(event) => setEditDraft({ ...editDraft, startDate: event.target.value })}
                    />
                    <TextInput
                      className="w-20"
                      inputMode="numeric"
                      value={editDraft.paymentTermsDays}
                      onChange={(event) => setEditDraft({ ...editDraft, paymentTermsDays: event.target.value })}
                    />
                    <Button onClick={() => void saveEdit()} disabled={busy}>
                      Save fields
                    </Button>
                    <Button variant="ghost" onClick={() => setEditing(false)}>
                      Done
                    </Button>
                  </>
                ) : (
                  <Button variant="secondary" onClick={() => setEditing(true)}>
                    Edit fields
                  </Button>
                )
              ) : null}
              {detail.status === "DRAFT" ? (
                <>
                  <TextInput
                    inputMode="numeric"
                    placeholder="Validity (days)"
                    value={validityDaysDraft}
                    onChange={(event) => setValidityDaysDraft(event.target.value)}
                    className="w-28"
                  />
                  <Button
                    disabled={busy}
                    onClick={() =>
                      void act("quotation", {
                        reason: reason || undefined,
                        validityDays:
                          validityDaysDraft === "" ? undefined : Math.max(Number.parseInt(validityDaysDraft, 10) || 15, 1),
                      })
                    }
                  >
                    Submit as quotation
                  </Button>
                </>
              ) : null}
              {detail.status === "QUOTATION" ? (
                <Button disabled={busy} onClick={() => void act("confirm", { reason: reason || undefined })}>
                  Confirm quotation
                </Button>
              ) : null}
              {detail.status === "CONFIRMED" ? (
                <Button disabled={busy} onClick={() => void act("activate", { reason: reason || undefined })}>
                  Activate
                </Button>
              ) : null}
              {detail.status === "ACTIVE" && detail.allowPause ? (
                <Button variant="secondary" disabled={busy} onClick={() => void act("pause", { reason: reason || undefined })}>
                  Pause
                </Button>
              ) : null}
              {detail.status === "PAUSED" ? (
                <Button disabled={busy} onClick={() => void act("resume", { reason: reason || undefined })}>
                  Resume
                </Button>
              ) : null}

              {(detail.status === "ACTIVE" || detail.status === "PAUSED") ? (
                <Button variant="danger" disabled={busy} onClick={() => void act("close", { reason: reason || undefined })}>
                  {detail.status === "ACTIVE" && !detail.allowEarlyClose ? "Close (Admin override)" : "Close"}
                </Button>
              ) : null}
              {(detail.status === "ACTIVE" || detail.status === "CLOSED") && detail.allowRenewal ? (
                <Button variant="secondary" disabled={busy} onClick={() => void act("renew", { reason: reason || undefined })}>
                  Renew
                </Button>
              ) : null}
            </div>
            <ErrorBanner error={actionError} />
            <p className="mt-1 text-xs text-slate-500">
              Actions honour the plan's policy (pause, early close, renewal); Admin overrides are audited.
            </p>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Lifecycle history</p>
            <ul className="space-y-1 text-xs text-slate-600">
              {detail.events.map((event) => (
                <li key={event.id} className="flex flex-wrap items-center gap-2">
                  <Badge tone={eventTone(event.eventType)}>{event.eventType}</Badge>
                  <span>{event.createdAt.slice(0, 16).replace("T", " ")}</span>
                  <span>{event.actorEmail ?? "system"}</span>
                  {event.reason ? <span className="text-slate-500">{event.reason}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Modal>
  );
}
