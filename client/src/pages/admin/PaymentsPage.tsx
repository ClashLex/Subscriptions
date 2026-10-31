import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { asApiError, formatMoney, list, type ApiError, type PageMeta } from "../../lib/api.js";
import type { PaymentListItem } from "../../lib/types.js";
import { Button, ErrorBanner, Field, PageHeading, Pagination, TableShell, TextInput } from "../../ui/components.js";

type Filters = { invoiceId: string; customerId: string; method: string; paidFrom: string; paidTo: string };
const EMPTY: Filters = { invoiceId: "", customerId: "", method: "", paidFrom: "", paidTo: "" };

export function PaymentsPage() {
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<PaymentListItem[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "20" });
      for (const key of ["invoiceId", "customerId", "method", "paidFrom", "paidTo"] as const) {
        if (filters[key]) params.set(key, filters[key]);
      }
      const result = await list<PaymentListItem>(`/payments?${params}`);
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

  function apply(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setFilters({ ...draft });
  }

  return <div>
    <PageHeading title="Payments" subtitle="Recorded payments and their invoice references. Add payments from the invoice detail screen." />
    <ErrorBanner error={error} />
    <form className="mb-4 grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-3 lg:grid-cols-6" onSubmit={apply}>
      <Field label="Invoice ID"><TextInput type="number" min="1" value={draft.invoiceId} onChange={(event) => setDraft({ ...draft, invoiceId: event.target.value })} /></Field>
      <Field label="Customer ID"><TextInput type="number" min="1" value={draft.customerId} onChange={(event) => setDraft({ ...draft, customerId: event.target.value })} /></Field>
      <Field label="Method"><TextInput maxLength={40} value={draft.method} onChange={(event) => setDraft({ ...draft, method: event.target.value })} /></Field>
      <Field label="Paid from"><TextInput type="date" value={draft.paidFrom} onChange={(event) => setDraft({ ...draft, paidFrom: event.target.value })} /></Field>
      <Field label="Paid to"><TextInput type="date" value={draft.paidTo} onChange={(event) => setDraft({ ...draft, paidTo: event.target.value })} /></Field>
      <div className="flex items-end"><Button type="submit" className="w-full">Apply filters</Button></div>
    </form>
    <TableShell head={<tr><th className="px-3 py-2">Paid at</th><th className="px-3 py-2">Invoice</th><th className="px-3 py-2">Customer</th><th className="px-3 py-2">Method / reference</th><th className="px-3 py-2">Amount</th><th className="px-3 py-2">Status</th></tr>}>
      {loading ? <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">Loading…</td></tr> : rows.length === 0 ? <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">No payments match these filters.</td></tr> : rows.map((row) => <tr key={row.id}><td className="px-3 py-2">{row.paidAt}</td><td className="px-3 py-2"><Link className="font-medium text-indigo-700 hover:underline" to={`/admin/invoices?open=${row.invoiceId}`}>{row.invoiceNumber}</Link></td><td className="px-3 py-2">{row.customerEmail}</td><td className="px-3 py-2">{row.method}{row.reference ? <span className="block text-xs text-slate-500">{row.reference}</span> : null}</td><td className="px-3 py-2">{formatMoney(row.amount)}</td><td className="px-3 py-2">{row.status}</td></tr>)}
    </TableShell>
    <Pagination meta={meta} onPage={setPage} />
  </div>;
}
