import { useEffect, useState, type FormEvent } from "react";
import { asApiError, list, request, type ApiError } from "../lib/api.js";
import type { FinanceSummary, Plan, Product, TaxRule } from "../lib/types.js";
import { Badge, Button, ErrorBanner, Field, PageHeading, TextInput } from "../ui/components.js";

const today = new Date().toISOString().slice(0, 10);
const initialPeriod = { from: `${today.slice(0, 7)}-01`, to: today };

export function OverviewPage() {
  const [draft, setDraft] = useState(initialPeriod);
  const [period, setPeriod] = useState(initialPeriod);
  const [finance, setFinance] = useState<FinanceSummary | null>(null);
  const [catalogue, setCatalogue] = useState<{ products: number; plans: number; taxes: number } | null>(null);
  const [financeError, setFinanceError] = useState<ApiError | null>(null);
  const [catalogueError, setCatalogueError] = useState<ApiError | null>(null);

  useEffect(() => {
    let active = true;
    setFinance(null);
    setFinanceError(null);
    const query = new URLSearchParams(period);
    void request<FinanceSummary>(`/finance/summary?${query}`).then((result) => {
      if (active) { setFinance(result); setFinanceError(null); }
    }).catch((caught: unknown) => { if (active) setFinanceError(asApiError(caught)); });
    return () => { active = false; };
  }, [period]);

  useEffect(() => {
    let active = true;
    void Promise.all([
      list<Product>("/products?pageSize=1"),
      list<Plan>("/plans?pageSize=1"),
      request<TaxRule[]>("/taxes"),
    ]).then(([products, plans, taxes]) => {
      if (active) setCatalogue({ products: products.meta.total, plans: plans.meta.total, taxes: taxes.length });
    }).catch((caught: unknown) => { if (active) setCatalogueError(asApiError(caught)); });
    return () => { active = false; };
  }, []);

  function apply(event: FormEvent) {
    event.preventDefault();
    setPeriod({ ...draft });
  }

  return <div className="space-y-5">
    <PageHeading title="Finance overview" subtitle="Invoiced and received amounts use the selected dates. Balances and active subscriptions are current." />
    <form className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4" onSubmit={apply}>
      <Field label="From"><TextInput required type="date" max={draft.to} value={draft.from} onChange={(event) => setDraft({ ...draft, from: event.target.value })} /></Field>
      <Field label="To"><TextInput required type="date" min={draft.from} value={draft.to} onChange={(event) => setDraft({ ...draft, to: event.target.value })} /></Field>
      <Button type="submit">Apply dates</Button>
    </form>
    <ErrorBanner error={financeError} />
    {finance ? <>
      <p className="text-sm text-slate-600">Selected period: {finance.period.from} to {finance.period.to}. Open balances as of {finance.asOf} (UTC).</p>
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Active subscriptions</p><p className="mt-1 text-2xl font-semibold">{finance.activeSubscriptions}</p><p className="text-xs text-slate-500">Current active contracts; paused and closed are excluded.</p></div>
      {finance.currencies.length === 0 ? <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">No invoices or payments have been recorded yet.</p> : finance.currencies.map((row) => <section key={row.currencyCode} className="space-y-3"><h2 className="text-sm font-semibold text-slate-700">{row.currencyCode}</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[
        { label: "Invoiced", value: row.invoiced, hint: "Confirmed or paid invoices issued in the period" },
        { label: "Cash received", value: row.received, hint: "Successful payments recorded in the period" },
        { label: "Outstanding", value: row.outstanding, hint: "Current unpaid confirmed invoices" },
        { label: "Overdue", value: row.overdue, hint: "Current unpaid balance past its due date" },
      ].map((card) => <div key={card.label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{card.label}</p><p className="mt-1 text-2xl font-semibold text-slate-900">{row.currencyCode} {card.value}</p><p className="text-xs text-slate-500">{card.hint}</p></div>)}</div></section>)}
    </> : !financeError ? <p className="text-sm text-slate-500">Loading finance summary…</p> : null}
    <div className="space-y-2 border-t border-slate-200 pt-4"><h2 className="text-sm font-semibold text-slate-700">Catalogue</h2><ErrorBanner error={catalogueError} />{catalogue ? <div className="flex flex-wrap gap-2"><Badge tone="indigo">{catalogue.products} active products</Badge><Badge tone="indigo">{catalogue.plans} plans</Badge><Badge tone="indigo">{catalogue.taxes} tax rules</Badge></div> : null}</div>
  </div>;
}
