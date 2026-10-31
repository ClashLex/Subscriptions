import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { asApiError, list, type ApiError, type PageMeta } from "../lib/api.js";
import { STATUS_LABELS, type SubscriptionListItem } from "../lib/types.js";
import { useSession } from "../state/session.js";
import { Badge, Button, ErrorBanner, Pagination, TableShell } from "../ui/components.js";
import { CustomerInvoices, CustomerPayments } from "./PortalBilling.js";

function statusTone(status: SubscriptionListItem["status"]): "green" | "amber" | "slate" | "indigo" {
  if (status === "ACTIVE") return "green";
  if (status === "PAUSED") return "amber";
  if (status === "CLOSED") return "slate";
  return "indigo";
}

function CustomerSubscriptions() {
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<SubscriptionListItem[] | null>(null);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    let active = true;
    void list<SubscriptionListItem>(`/subscriptions?page=${page}&pageSize=20`).then((result) => {
      if (active) { setRows(result.data); setMeta(result.meta); setError(null); }
    }).catch((caught: unknown) => { if (active) setError(asApiError(caught)); });
    return () => { active = false; };
  }, [page]);

  return <section>
    <h1 className="text-lg font-semibold text-slate-900">My subscriptions</h1>
    <p className="mt-1 text-sm text-slate-500">Your quotations, contracts, and next billing dates.</p>
    <div className="mt-4"><ErrorBanner error={error} /></div>
    <TableShell head={<tr><th className="px-3 py-2">Number</th><th className="px-3 py-2">Plan</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Start / expiry</th><th className="px-3 py-2">Next billing</th></tr>}>
      {rows === null && !error ? <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">Loading your subscriptions…</td></tr> : rows?.length === 0 ? <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">No subscriptions yet. Your first quotation will appear here once our team sets it up.</td></tr> : rows?.map((row) => <tr key={row.id}><td className="px-3 py-2 font-mono text-xs font-medium text-indigo-700">{row.subscriptionNumber}</td><td className="px-3 py-2">{row.planName}</td><td className="px-3 py-2"><Badge tone={statusTone(row.status)}>{STATUS_LABELS[row.status]}</Badge></td><td className="px-3 py-2 text-xs text-slate-600">{row.startDate ?? "∞"} → {row.expiryDate ?? "∞"}</td><td className="px-3 py-2 text-xs text-slate-600">{row.nextBillingAt?.slice(0, 10) ?? "—"}</td></tr>)}
    </TableShell>
    <Pagination meta={meta} onPage={setPage} />
  </section>;
}

export function PortalPage() {
  const session = useSession();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "invoices" ? "invoices" : params.get("tab") === "payments" ? "payments" : "subscriptions";
  const openId = Number(params.get("open"));

  return <div className="min-h-screen bg-slate-100">
    <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3"><div className="flex items-center gap-3"><span className="text-sm font-semibold tracking-tight text-slate-900">Subscriptions</span><Badge tone="green">My portal</Badge></div><div className="flex items-center gap-3"><span className="text-sm text-slate-600">{session.user?.email}</span><Button variant="secondary" onClick={() => { void session.logout(); navigate("/"); }}>Sign out</Button></div></div>
      <nav className="mx-auto flex max-w-5xl gap-1 px-4">{(["subscriptions", "invoices", "payments"] as const).map((item) => <button key={item} type="button" onClick={() => setParams(item === "subscriptions" ? {} : { tab: item })} className={`rounded-t-md border-b-2 px-4 py-2 text-sm font-medium capitalize ${tab === item ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-600 hover:text-slate-900"}`}>{item}</button>)}</nav>
    </header>
    <main className="mx-auto max-w-5xl px-4 py-6">{tab === "subscriptions" ? <CustomerSubscriptions /> : tab === "invoices" ? <CustomerInvoices openId={Number.isSafeInteger(openId) && openId > 0 ? openId : null} /> : <CustomerPayments onInvoice={(id) => setParams({ tab: "invoices", open: String(id) })} />}</main>
  </div>;
}
