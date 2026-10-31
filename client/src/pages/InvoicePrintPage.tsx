import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError, asApiError, request } from "../lib/api.js";
import type { InvoiceDetail } from "../lib/types.js";
import { useSession } from "../state/session.js";
import { Button, ErrorBanner } from "../ui/components.js";

export function InvoicePrintPage() {
  const { id } = useParams();
  const role = useSession().user?.role;
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    const invoiceId = Number(id);
    if (!Number.isSafeInteger(invoiceId) || invoiceId <= 0) return;
    let active = true;
    void request<InvoiceDetail>(`/invoices/${invoiceId}`).then((result) => {
      if (active) { setInvoice(result); setError(null); }
    }).catch((caught: unknown) => { if (active) setError(asApiError(caught)); });
    return () => { active = false; };
  }, [id]);

  useEffect(() => {
    if (!invoice) return;
    const previous = document.title;
    document.title = `Invoice ${invoice.invoiceNumber}`;
    return () => { document.title = previous; };
  }, [invoice]);

  const invoiceId = Number(id);
  const invalid = !Number.isSafeInteger(invoiceId) || invoiceId <= 0;
  const money = (value: string) => `${invoice?.currencyCode ?? ""} ${value}`;
  const back = role === "CUSTOMER" ? "/portal?tab=invoices" : `/admin/invoices?open=${invoiceId}`;

  return <main className="min-h-screen bg-slate-100 p-4 text-slate-900">
    <div className="invoice-print-actions mx-auto mb-4 flex max-w-4xl items-center justify-between gap-3"><Link className="text-sm font-medium text-indigo-700 hover:underline" to={back}>← Back to invoices</Link><Button onClick={() => window.print()} disabled={!invoice}>Print / save PDF</Button></div>
    <div className="invoice-print-page mx-auto max-w-4xl rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
      {invalid ? <ErrorBanner error={new ApiError(400, "INVALID_ID", "Invalid invoice number.")} /> : <ErrorBanner error={error} />}
      {!invoice && !error && !invalid ? <p className="text-sm text-slate-500">Loading invoice…</p> : null}
      {invoice ? <div className="space-y-8">
        <header className="flex flex-wrap items-start justify-between gap-6 border-b border-slate-200 pb-6"><div><p className="text-sm font-semibold uppercase tracking-widest text-indigo-700">Subscriptions</p><h1 className="mt-2 text-3xl font-semibold">Invoice</h1><p className="mt-1 font-mono text-sm">{invoice.invoiceNumber}</p></div><div className="text-right text-sm"><p className="font-semibold">{invoice.status}</p><p>Issued: {invoice.issueDate}</p><p>Due: {invoice.dueDate}</p><p>Currency: {invoice.currencyCode}</p></div></header>
        <div className="grid gap-5 text-sm sm:grid-cols-2"><div><p className="text-xs font-semibold uppercase text-slate-500">Bill to</p><p className="mt-1">{invoice.customerEmail}</p></div><div><p className="text-xs font-semibold uppercase text-slate-500">Subscription and period</p><p className="mt-1">{invoice.subscriptionNumber}</p><p>{invoice.periodStart} to {invoice.periodEnd}</p></div></div>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b-2 border-slate-300 text-xs uppercase text-slate-500"><th className="py-3">Description</th><th className="py-3">Qty</th><th className="py-3">Unit</th><th className="py-3">Discount</th><th className="py-3">Tax</th><th className="py-3 text-right">Line total</th></tr></thead><tbody>{invoice.lines.map((line) => <tr key={line.id} className="border-b border-slate-200"><td className="py-3">{line.description}</td><td>{line.quantity}</td><td>{money(line.unitPrice)}</td><td>{money(line.discountAmount)}</td><td>{line.taxName ? `${line.taxName} (${line.taxRate}%, ${line.taxMode})` : "—"}<br />{money(line.taxAmount)}</td><td className="text-right">{money(line.lineTotal)}</td></tr>)}</tbody></table></div>
        <div className="ml-auto w-full max-w-xs space-y-2 text-sm"><div className="flex justify-between"><span>Subtotal</span><span>{money(invoice.subtotal)}</span></div><div className="flex justify-between"><span>Discount</span><span>{money(invoice.discountTotal)}</span></div><div className="flex justify-between"><span>Tax</span><span>{money(invoice.taxTotal)}</span></div><div className="flex justify-between border-t border-slate-300 pt-2 text-base font-semibold"><span>Total</span><span>{money(invoice.grandTotal)}</span></div><div className="flex justify-between"><span>Paid</span><span>{money(invoice.ledger.paidTotal)}</span></div><div className="flex justify-between font-semibold"><span>Outstanding</span><span>{money(invoice.ledger.outstanding)}</span></div></div>
        {invoice.status === "CANCELLED" ? <p className="rounded border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">Cancelled invoice — no payment is due.</p> : null}
        {invoice.status === "DRAFT" ? <p className="rounded border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-700">Draft invoice — not yet issued.</p> : null}
      </div> : null}
    </div>
  </main>;
}
