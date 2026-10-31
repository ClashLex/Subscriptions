import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { asApiError, formatMoney, list, request, type ApiError, type PageMeta } from "../lib/api.js";
import type { InvoiceDetail, InvoiceListItem, PaymentListItem } from "../lib/types.js";
import { Badge, Button, ErrorBanner, Modal, PageHeading, Pagination, TableShell } from "../ui/components.js";

export function CustomerInvoices({ openId }: { openId: number | null }) {
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<InvoiceListItem[] | null>(null);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [detailError, setDetailError] = useState<ApiError | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const detailRequest = useRef(0);

  useEffect(() => {
    let active = true;
    void list<InvoiceListItem>(`/invoices?page=${page}&pageSize=20`).then((result) => {
      if (active) { setRows(result.data); setMeta(result.meta); setError(null); }
    }).catch((caught: unknown) => { if (active) setError(asApiError(caught)); });
    return () => { active = false; };
  }, [page]);

  const open = useCallback(async (id: number) => {
    const requestId = ++detailRequest.current;
    setSelectedId(id); setDetail(null); setDetailError(null); setDetailLoading(true);
    try {
      const result = await request<InvoiceDetail>(`/invoices/${id}`);
      if (detailRequest.current === requestId) setDetail(result);
    } catch (caught) {
      if (detailRequest.current === requestId) setDetailError(asApiError(caught));
    } finally {
      if (detailRequest.current === requestId) setDetailLoading(false);
    }
  }, []);

  useEffect(() => { if (openId !== null) void open(openId); }, [openId, open]);

  return <section>
    <PageHeading title="My invoices" subtitle="Issued invoices, due dates, balances, and line details for your account." />
    <ErrorBanner error={error} />
    <TableShell head={<tr><th className="px-3 py-2">Invoice</th><th className="px-3 py-2">Subscription / period</th><th className="px-3 py-2">Due</th><th className="px-3 py-2">Total</th><th className="px-3 py-2">Status</th><th className="px-3 py-2 text-right">Action</th></tr>}>
      {rows === null && !error ? <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">Loading invoices…</td></tr> : rows?.length === 0 ? <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">No issued invoices yet.</td></tr> : rows?.map((row) => <tr key={row.id}><td className="px-3 py-2 font-medium">{row.invoiceNumber}</td><td className="px-3 py-2 text-xs text-slate-600">{row.subscriptionNumber}<br />{row.periodStart} – {row.periodEnd}</td><td className="px-3 py-2">{row.dueDate}</td><td className="px-3 py-2">{row.currencyCode} {row.grandTotal}</td><td className="px-3 py-2"><Badge tone={row.status === "PAID" ? "green" : row.status === "CANCELLED" ? "slate" : "indigo"}>{row.status}</Badge></td><td className="px-3 py-2 text-right"><Button variant="secondary" onClick={() => void open(row.id)}>View</Button></td></tr>)}
    </TableShell>
    <Pagination meta={meta} onPage={setPage} />
    <Modal open={selectedId !== null} title={detail?.invoiceNumber ?? "Invoice"} onClose={() => { detailRequest.current += 1; setSelectedId(null); setDetail(null); }} wide>
      {detailLoading ? <p className="text-sm text-slate-500">Loading invoice…</p> : null}<ErrorBanner error={detailError} />
      {detail ? <div className="space-y-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><Badge tone={detail.status === "PAID" ? "green" : detail.status === "CANCELLED" ? "slate" : "indigo"}>{detail.status}</Badge> {detail.ledger.overdue ? <Badge tone="red">Overdue</Badge> : detail.ledger.partiallyPaid ? <Badge tone="amber">Partially paid</Badge> : null}</div><Link className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100" to={`/invoices/${detail.id}/print`} target="_blank" rel="noopener noreferrer">Print / save PDF</Link></div>
        <div className="grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-2"><p><strong>Subscription:</strong> {detail.subscriptionNumber}</p><p><strong>Period:</strong> {detail.periodStart} – {detail.periodEnd}</p><p><strong>Issued:</strong> {detail.issueDate}</p><p><strong>Due:</strong> {detail.dueDate}</p></div>
        <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr className="border-b text-xs uppercase text-slate-500"><th className="py-2">Line</th><th>Quantity</th><th>Unit price</th><th>Discount</th><th>Tax</th><th className="text-right">Total</th></tr></thead><tbody>{detail.lines.map((line) => <tr key={line.id} className="border-b"><td className="py-2">{line.description}</td><td>{line.quantity}</td><td>{formatMoney(line.unitPrice)}</td><td>{formatMoney(line.discountAmount)}</td><td>{formatMoney(line.taxAmount)}</td><td className="text-right">{formatMoney(line.lineTotal)}</td></tr>)}</tbody></table></div>
        <div className="grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-3"><p>Subtotal <strong>{formatMoney(detail.subtotal)}</strong></p><p>Discount <strong>{formatMoney(detail.discountTotal)}</strong></p><p>Tax <strong>{formatMoney(detail.taxTotal)}</strong></p><p>Total <strong>{formatMoney(detail.grandTotal)}</strong></p><p>Paid <strong>{formatMoney(detail.ledger.paidTotal)}</strong></p><p>Outstanding <strong>{formatMoney(detail.ledger.outstanding)}</strong></p></div>
        <div><h3 className="font-semibold">Payments</h3>{detail.payments.length === 0 ? <p className="text-slate-500">No payments recorded.</p> : <ul className="mt-2 space-y-1">{detail.payments.map((payment) => <li key={payment.id} className="rounded border border-slate-200 p-2">{payment.paidAt} · {payment.method} · {formatMoney(payment.amount)} · {payment.status}{payment.reference ? ` · ${payment.reference}` : ""}</li>)}</ul>}</div>
      </div> : null}
    </Modal>
  </section>;
}

export function CustomerPayments({ onInvoice }: { onInvoice: (id: number) => void }) {
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<PaymentListItem[] | null>(null);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    let active = true;
    void list<PaymentListItem>(`/payments?page=${page}&pageSize=20`).then((result) => {
      if (active) { setRows(result.data); setMeta(result.meta); setError(null); }
    }).catch((caught: unknown) => { if (active) setError(asApiError(caught)); });
    return () => { active = false; };
  }, [page]);

  return <section>
    <PageHeading title="My payments" subtitle="Payments recorded against your invoices." />
    <ErrorBanner error={error} />
    <TableShell head={<tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Invoice</th><th className="px-3 py-2">Method</th><th className="px-3 py-2">Reference</th><th className="px-3 py-2">Amount</th><th className="px-3 py-2">Status</th></tr>}>
      {rows === null && !error ? <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">Loading payments…</td></tr> : rows?.length === 0 ? <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">No payments recorded yet.</td></tr> : rows?.map((row) => <tr key={row.id}><td className="px-3 py-2">{row.paidAt}</td><td className="px-3 py-2"><button type="button" className="font-medium text-indigo-700 hover:underline" onClick={() => onInvoice(row.invoiceId)}>{row.invoiceNumber}</button></td><td className="px-3 py-2">{row.method}</td><td className="px-3 py-2">{row.reference ?? "—"}</td><td className="px-3 py-2">{formatMoney(row.amount)}</td><td className="px-3 py-2">{row.status}</td></tr>)}
    </TableShell>
    <Pagination meta={meta} onPage={setPage} />
  </section>;
}
