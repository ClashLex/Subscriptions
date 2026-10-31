import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { asApiError, list, request, type ApiError } from "../lib/api.js";
import type { FinanceSummary, Plan, Product, TaxRule } from "../lib/types.js";
import SpotlightCard from "../reactbits/SpotlightCard.js";
import { Badge, Button, ErrorBanner, Field, TextInput } from "../ui/components.js";

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

  return <div className="dashboard">
    <section className="dashboard-hero">
      <div className="dashboard-hero__content">
        <p className="eyebrow"><span className="eyebrow__line" /> OPERATIONS / LIVE</p>
        <h1 aria-label="Finance overview">Finance overview<span aria-hidden="true">.</span></h1>
        <p>Your recurring business, in focus. Track what was billed, what came in, and what still needs attention.</p>
        <div className="dashboard-hero__actions"><Link to="/admin/subscriptions" className="dashboard-hero__primary">View subscriptions <span aria-hidden="true">↗</span></Link><Link to="/admin/invoices" className="dashboard-hero__secondary">Invoices & billing <span aria-hidden="true">→</span></Link></div>
      </div>
      <div className="dashboard-hero__art" aria-hidden="true"><span className="dashboard-hero__ring dashboard-hero__ring--one" /><span className="dashboard-hero__ring dashboard-hero__ring--two" /><span className="dashboard-hero__ring dashboard-hero__ring--three" /><span className="dashboard-hero__spark">✳</span></div>
    </section>

    <div className="dashboard-toolbar">
      <div><p className="eyebrow"><span className="eyebrow__line" /> Financial health</p><h2>At a glance</h2><p>Invoiced and received amounts use your selected dates. Balances and active plans are current.</p></div>
      <form className="dashboard-dates" onSubmit={apply}>
        <Field label="From"><TextInput required type="date" max={draft.to} value={draft.from} onChange={(event) => setDraft({ ...draft, from: event.target.value })} /></Field>
        <Field label="To"><TextInput required type="date" min={draft.from} value={draft.to} onChange={(event) => setDraft({ ...draft, to: event.target.value })} /></Field>
        <Button type="submit">Apply dates</Button>
      </form>
    </div>

    <ErrorBanner error={financeError} />
    {finance ? <>
      <p className="dashboard-period">Selected period <strong>{finance.period.from} → {finance.period.to}</strong> <span>·</span> Open balances as of {finance.asOf} UTC</p>
      <section className="dashboard-metrics" aria-label="Finance metrics">
        <SpotlightCard className="dashboard-metric dashboard-metric--featured" theme="dark" spotlightColor="#bcf56d" intensity={.5}>
          <span className="dashboard-metric__icon" aria-hidden="true">↗</span><p>Active subscriptions</p><strong>{finance.activeSubscriptions}</strong><small>Contracts currently in service</small>
        </SpotlightCard>
        {finance.currencies.length === 0 ? <div className="dashboard-metric-empty">No invoices or payments have been recorded yet. Create a subscription, activate it, and run billing to see financial activity here.</div> : finance.currencies.map((row) => <div className="dashboard-currency" key={row.currencyCode}>
          <div className="dashboard-currency__heading"><h3>{row.currencyCode} performance</h3><span>Selected period & live balances</span></div>
          <div className="dashboard-currency__grid">{[
            { label: "Invoiced", value: row.invoiced, hint: "Confirmed and paid invoices issued in the period", mark: "↗" },
            { label: "Cash received", value: row.received, hint: "Successful payments recorded in the period", mark: "↓" },
            { label: "Outstanding", value: row.outstanding, hint: "Current unpaid confirmed invoices", mark: "◷" },
            { label: "Overdue", value: row.overdue, hint: "Current balance past its due date", mark: "!" },
          ].map((card) => <SpotlightCard className="dashboard-metric" theme="light" spotlightColor="#a5dd9e" intensity={.45} key={card.label}><span className="dashboard-metric__icon" aria-hidden="true">{card.mark}</span><p>{card.label}</p><strong><span>{row.currencyCode}</span> {card.value}</strong><small>{card.hint}</small></SpotlightCard>)}</div>
        </div>)}
      </section>
    </> : !financeError ? <div className="dashboard-loading">Loading finance summary…</div> : null}

    <section className="dashboard-catalogue"><div><p className="eyebrow"><span className="eyebrow__line" /> Your catalogue</p><h2>Ready to grow with you.</h2><p>Products, plans, and taxes that keep subscriptions moving.</p></div><ErrorBanner error={catalogueError} />{catalogue ? <div className="dashboard-catalogue__stats"><Badge tone="indigo">{catalogue.products} active products</Badge><Badge tone="indigo">{catalogue.plans} plans</Badge><Badge tone="indigo">{catalogue.taxes} tax rules</Badge></div> : null}</section>
  </div>;
}
