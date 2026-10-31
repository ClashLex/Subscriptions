import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ApiError, asApiError, formatMoney, list, request, type PageMeta } from "../../lib/api.js";
import type { BillingRunResult, InvoiceDetail, InvoiceListItem, InvoiceStatus } from "../../lib/types.js";
import { useSession } from "../../state/session.js";
import { Badge, Button, Checkbox, ErrorBanner, Field, Modal, PageHeading, Pagination, Select, TableShell, TextArea, TextInput } from "../../ui/components.js";

const PAGE_SIZE = 20;
type Filters = { status: string; customerId: string; subscriptionId: string; issuedFrom: string; issuedTo: string; overdueOnly: boolean };
const EMPTY_FILTERS: Filters = { status: "", customerId: "", subscriptionId: "", issuedFrom: "", issuedTo: "", overdueOnly: false };

function cents(value: string): bigint | null {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, fractional = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fractional.padEnd(2, "0"));
}

function statusBadge(status: InvoiceStatus) {
  return <Badge tone={status === "PAID" ? "green" : status === "CANCELLED" ? "red" : status === "DRAFT" ? "slate" : "indigo"}>{status}</Badge>;
}

export function InvoicesPage() {
  const isAdmin = useSession().isAdmin;
  const [searchParams] = useSearchParams();
  const [draftFilters, setDraftFilters] = useState<Filters>(EMPTY_FILTERS);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<InvoiceListItem[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<BillingRunResult | null>(null);
  const [payment, setPayment] = useState({ method: "", amount: "", paidAt: "", reference: "", note: "" });
  const detailRequest = useRef(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      for (const key of ["status", "customerId", "subscriptionId", "issuedFrom", "issuedTo"] as const) {
        if (filters[key]) params.set(key, filters[key]);
      }
      if (filters.overdueOnly) params.set("overdueOnly", "true");
      const result = await list<InvoiceListItem>(`/invoices?${params}`);
      setRows(result.data);
      setMeta(result.meta);
      setError(null);
    } catch (caught) {
      setError(asApiError(caught));
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => { void load(); }, [load]);

  const openInvoice = useCallback(async (id: number) => {
    const requestId = ++detailRequest.current;
    setSelectedId(id);
    setDetail(null);
    setDetailError(null);
    setSentTo(null);
    setDetailLoading(true);
    try {
      const result = await request<InvoiceDetail>(`/invoices/${id}`);
      if (requestId === detailRequest.current) {
        setDetail(result);
        setPayment({ method: "", amount: result.ledger.outstanding, paidAt: "", reference: "", note: "" });
      }
    } catch (caught) {
      if (requestId === detailRequest.current) setDetailError(asApiError(caught));
    } finally {
      if (requestId === detailRequest.current) setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = Number(searchParams.get("open"));
    if (Number.isSafeInteger(id) && id > 0) void openInvoice(id);
  }, [openInvoice, searchParams]);

  async function mutate(path: string, body?: unknown) {
    if (!detail || busy) return;
    setBusy(true);
    setDetailError(null);
    try {
      const updated = await request<InvoiceDetail>(path, { method: "POST", body });
      setDetail(updated);
      setPayment((current) => ({ ...current, amount: updated.ledger.outstanding }));
      await load();
    } catch (caught) {
      setDetailError(asApiError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function runBilling() {
    if (running || !window.confirm("Run billing for all subscriptions currently due?")) return;
    setRunning(true);
    setError(null);
    setRunResult(null);
    try {
      const result = await request<BillingRunResult>("/billing/run", { method: "POST" });
      setRunResult(result);
      if (page === 1) await load();
      else setPage(1);
    } catch (caught) {
      setError(asApiError(caught));
    } finally {
      setRunning(false);
    }
  }

  async function sendInvoice() {
    if (!detail || sending) return;
    setSending(true);
    setDetailError(null);
    setSentTo(null);
    try {
      const result = await request<{ delivered: boolean; to: string }>(`/invoices/${detail.id}/send`, { method: "POST" });
      if (result.delivered) setSentTo(result.to);
    } catch (caught) {
      setDetailError(asApiError(caught));
    } finally {
      setSending(false);
    }
  }

  function recordPayment(event: FormEvent) {
    event.preventDefault();
    if (!detail || busy) return;
    const amount = cents(payment.amount.trim());
    const outstanding = cents(detail.ledger.outstanding);
    if (amount === null || amount <= 0n || outstanding === null || amount > outstanding) {
      setDetailError(new ApiError(0, "INVALID_AMOUNT", "Enter a positive amount no greater than the outstanding balance, with at most two decimals."));
      return;
    }
    void mutate(`/invoices/${detail.id}/payments`, {
      method: payment.method.trim(), amount: payment.amount.trim(),
      paidAt: payment.paidAt || undefined,
      reference: payment.reference.trim() || undefined,
      note: payment.note.trim() || undefined,
    });
  }

  return <div>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <PageHeading title="Invoices & billing" subtitle="Generate due invoices, review line snapshots and balances, then confirm and collect payment." />
      {isAdmin ? <Button disabled={running} onClick={() => void runBilling()}>{running ? "Running…" : "Run billing"}</Button> : null}
    </div>
    <ErrorBanner error={error} />
    {runResult ? <div className="mb-4 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-900">
      <strong>Billing run:</strong> {runResult.scanned} scanned, {runResult.invoices.length} invoices created, {runResult.skipped.length} skipped, {runResult.autoClosed.length} subscriptions closed, {runResult.failed.length} failed.
      {runResult.failed.length > 0 ? <ul className="mt-2 list-disc pl-5">{runResult.failed.map((item) => <li key={`${item.operation}-${item.subscriptionId}`}>{item.subscriptionNumber}: {item.operation} failed. Check the server log.</li>)}</ul> : null}
    </div> : null}
    <form className="mb-4 grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-3 lg:grid-cols-6" onSubmit={(event) => { event.preventDefault(); setPage(1); setFilters({ ...draftFilters }); }}>
      <Field label="Status"><Select value={draftFilters.status} onChange={(event) => setDraftFilters({ ...draftFilters, status: event.target.value })}><option value="">All</option>{(["DRAFT", "CONFIRMED", "PAID", "CANCELLED"] as const).map((value) => <option key={value}>{value}</option>)}</Select></Field>
      <Field label="Customer ID"><TextInput type="number" min="1" value={draftFilters.customerId} onChange={(event) => setDraftFilters({ ...draftFilters, customerId: event.target.value })} /></Field>
      <Field label="Subscription ID"><TextInput type="number" min="1" value={draftFilters.subscriptionId} onChange={(event) => setDraftFilters({ ...draftFilters, subscriptionId: event.target.value })} /></Field>
      <Field label="Issued from"><TextInput type="date" value={draftFilters.issuedFrom} onChange={(event) => setDraftFilters({ ...draftFilters, issuedFrom: event.target.value })} /></Field>
      <Field label="Issued to"><TextInput type="date" value={draftFilters.issuedTo} onChange={(event) => setDraftFilters({ ...draftFilters, issuedTo: event.target.value })} /></Field>
      <div className="flex flex-col justify-end gap-2"><Checkbox label="Overdue only" checked={draftFilters.overdueOnly} onChange={(value) => setDraftFilters({ ...draftFilters, overdueOnly: value })} /><Button type="submit">Apply filters</Button></div>
    </form>
    <TableShell head={<tr><th className="px-3 py-2">Invoice</th><th className="px-3 py-2">Customer / subscription</th><th className="px-3 py-2">Period</th><th className="px-3 py-2">Due</th><th className="px-3 py-2">Total</th><th className="px-3 py-2">Status</th><th className="px-3 py-2 text-right">Action</th></tr>}>
      {loading ? <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-500">Loading…</td></tr> : rows.length === 0 ? <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-500">No invoices match these filters.</td></tr> : rows.map((row) => <tr key={row.id}>
        <td className="px-3 py-2 font-medium">{row.invoiceNumber}</td><td className="px-3 py-2 text-slate-600">{row.customerEmail}<br />{row.subscriptionNumber}</td><td className="px-3 py-2 text-slate-600">{row.periodStart} – {row.periodEnd}</td><td className="px-3 py-2">{row.dueDate}</td><td className="px-3 py-2">{formatMoney(row.grandTotal)}</td><td className="px-3 py-2">{statusBadge(row.status)}</td><td className="px-3 py-2 text-right"><Button variant="secondary" onClick={() => void openInvoice(row.id)}>View</Button></td>
      </tr>)}
    </TableShell>
    <Pagination meta={meta} onPage={setPage} />
    <Modal open={selectedId !== null} title={detail?.invoiceNumber ?? "Invoice"} onClose={() => { if (!busy) { detailRequest.current += 1; setSelectedId(null); setDetail(null); } }} wide>
      {detailLoading ? <p className="text-sm text-slate-500">Loading invoice…</p> : null}
      <ErrorBanner error={detailError} />
      {sentTo ? <p className="mb-3 rounded border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-700">Invoice email sent to {sentTo}.</p> : null}
      {detail ? <div className="space-y-5 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-3"><div>{statusBadge(detail.status)} {detail.ledger.overdue ? <Badge tone="red">Overdue</Badge> : detail.ledger.partiallyPaid ? <Badge tone="amber">Partially paid</Badge> : null}</div><div className="flex flex-wrap gap-2"><Link className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100" to={`/invoices/${detail.id}/print`} target="_blank" rel="noopener noreferrer">Print / save PDF</Link>{(detail.status === "CONFIRMED" || detail.status === "PAID") ? <Button variant="secondary" disabled={sending || busy} onClick={() => void sendInvoice()}>{sending ? "Sending…" : "Email customer"}</Button> : null}{detail.status === "DRAFT" ? <Button disabled={busy} onClick={() => void mutate(`/invoices/${detail.id}/confirm`)}>Confirm invoice</Button> : null}{(detail.status === "DRAFT" || detail.status === "CONFIRMED") && detail.payments.length === 0 ? <Button variant="danger" disabled={busy} onClick={() => { const reason = window.prompt("Reason for cancellation (optional)"); if (reason !== null) void mutate(`/invoices/${detail.id}/cancel`, { reason: reason.trim() }); }}>Cancel invoice</Button> : null}</div></div>
        <div className="grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-2"><p><strong>Customer:</strong> {detail.customerEmail}</p><p><strong>Subscription:</strong> {detail.subscriptionNumber}</p><p><strong>Period:</strong> {detail.periodStart} – {detail.periodEnd}</p><p><strong>Issued / due:</strong> {detail.issueDate} / {detail.dueDate}</p></div>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-xs uppercase text-slate-500"><th className="py-2">Line</th><th>Qty × unit</th><th>Discount</th><th>Tax</th><th className="text-right">Total</th></tr></thead><tbody>{detail.lines.map((line) => <tr key={line.id} className="border-b"><td className="py-2">{line.description}</td><td>{line.quantity} × {formatMoney(line.unitPrice)}</td><td>{formatMoney(line.discountAmount)}{line.discountRuleId ? ` (#${line.discountRuleId})` : ""}</td><td>{line.taxName ?? "—"} {formatMoney(line.taxAmount)}</td><td className="text-right">{formatMoney(line.lineTotal)}</td></tr>)}</tbody></table></div>
        <div className="grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-3"><p>Subtotal <strong>{formatMoney(detail.subtotal)}</strong></p><p>Discount <strong>{formatMoney(detail.discountTotal)}</strong></p><p>Tax <strong>{formatMoney(detail.taxTotal)}</strong></p><p>Grand total <strong>{formatMoney(detail.grandTotal)}</strong></p><p>Paid <strong>{formatMoney(detail.ledger.paidTotal)}</strong></p><p>Outstanding <strong>{formatMoney(detail.ledger.outstanding)}</strong></p></div>
        <section><h3 className="mb-2 font-semibold">Payments</h3>{detail.payments.length === 0 ? <p className="text-slate-500">No payments recorded.</p> : <ul className="space-y-2">{detail.payments.map((item) => <li key={item.id} className="rounded border border-slate-200 p-2">{item.paidAt} · {item.method} · {formatMoney(item.amount)} · {item.status}{item.reference ? ` · Ref ${item.reference}` : ""}{item.note ? <p className="text-slate-500">{item.note}</p> : null}</li>)}</ul>}</section>
        {detail.status === "CONFIRMED" && cents(detail.ledger.outstanding) !== 0n ? <form className="space-y-3 rounded-lg border border-slate-200 p-3" onSubmit={recordPayment}><h3 className="font-semibold">Record payment</h3><div className="grid gap-3 sm:grid-cols-3"><Field label="Method"><TextInput required maxLength={40} placeholder="Bank transfer" value={payment.method} onChange={(event) => setPayment({ ...payment, method: event.target.value })} /></Field><Field label="Amount"><TextInput required inputMode="decimal" value={payment.amount} onChange={(event) => setPayment({ ...payment, amount: event.target.value })} /></Field><Field label="Paid on (optional)"><TextInput type="date" value={payment.paidAt} onChange={(event) => setPayment({ ...payment, paidAt: event.target.value })} /></Field></div><div className="grid gap-3 sm:grid-cols-2"><Field label="Reference"><TextInput maxLength={120} value={payment.reference} onChange={(event) => setPayment({ ...payment, reference: event.target.value })} /></Field><Field label="Note"><TextArea rows={1} maxLength={500} value={payment.note} onChange={(event) => setPayment({ ...payment, note: event.target.value })} /></Field></div><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Record payment"}</Button></form> : null}
      </div> : null}
    </Modal>
  </div>;
}
