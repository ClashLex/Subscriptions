import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { asApiError, formatMoney, list, request, type ApiError, type PageMeta } from "../lib/api.js";
import { STATUS_LABELS, type SubscriptionDetail, type SubscriptionListItem } from "../lib/types.js";
import { useSession } from "../state/session.js";
import { Badge, Button, ErrorBanner, Modal, Pagination, TableShell } from "../ui/components.js";
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
  const [detail, setDetail] = useState<SubscriptionDetail | null>(null);
  const [detailError, setDetailError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    void list<SubscriptionListItem>(`/subscriptions?page=${page}&pageSize=20`).then((result) => {
      if (active) { setRows(result.data); setMeta(result.meta); setError(null); }
    }).catch((caught: unknown) => { if (active) setError(asApiError(caught)); });
    return () => { active = false; };
  }, [page, revision]);

  async function open(id: number) {
    setDetailError(null);
    setNotice(null);
    try { setDetail(await request<SubscriptionDetail>(`/subscriptions/${id}`)); }
    catch (caught) { setDetailError(asApiError(caught)); }
  }

  async function change(path: string, method: "POST" | "PATCH", body: unknown, renewal = false) {
    if (!detail || busy) return;
    setBusy(true);
    setDetailError(null);
    setNotice(null);
    try {
      const updated = await request<SubscriptionDetail>(`/subscriptions/${detail.id}${path}`, { method, body });
      setDetail(renewal ? detail : updated);
      setNotice(renewal ? `Renewal ${updated.subscriptionNumber} was requested. Our team will review and activate it.` : "Subscription updated. Future invoices will use the current selection.");
      setRevision((value) => value + 1);
    } catch (caught) { setDetailError(asApiError(caught)); }
    finally { setBusy(false); }
  }

  return <section>
    <h1 className="text-lg font-semibold text-slate-900">My subscriptions</h1>
    <p className="mt-1 text-sm text-slate-500">Your quotations, contracts, and next billing dates.</p>
    <div className="mt-4"><ErrorBanner error={error} /></div>
    <TableShell head={<tr><th className="px-3 py-2">Number</th><th className="px-3 py-2">Plan</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Start / expiry</th><th className="px-3 py-2">Next billing</th><th className="px-3 py-2">Action</th></tr>}>
      {rows === null && !error ? <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">Loading your subscriptions…</td></tr> : rows?.length === 0 ? <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">No subscriptions yet. Your first quotation will appear here once our team sets it up.</td></tr> : rows?.map((row) => <tr key={row.id}><td className="px-3 py-2 font-mono text-xs font-medium text-indigo-700">{row.subscriptionNumber}</td><td className="px-3 py-2">{row.planName}</td><td className="px-3 py-2"><Badge tone={statusTone(row.status)}>{STATUS_LABELS[row.status]}</Badge></td><td className="px-3 py-2 text-xs text-slate-600">{row.startDate ?? "∞"} → {row.expiryDate ?? "∞"}</td><td className="px-3 py-2 text-xs text-slate-600">{row.nextBillingAt?.slice(0, 10) ?? "—"}</td><td className="px-3 py-2"><Button variant="secondary" onClick={() => void open(row.id)}>Manage</Button></td></tr>)}
    </TableShell>
    <Pagination meta={meta} onPage={setPage} />
    <ErrorBanner error={detail === null ? detailError : null} />
    <Modal open={detail !== null} title={detail ? `${detail.subscriptionNumber} · ${detail.planName}` : "Subscription"} onClose={() => { setDetail(null); setDetailError(null); }} wide>
      {detail ? <div className="space-y-4 text-sm">
        <div className="flex flex-wrap items-center gap-3"><Badge tone={statusTone(detail.status)}>{STATUS_LABELS[detail.status]}</Badge><span>Next billing: {detail.nextBillingAt?.slice(0, 10) ?? "—"}</span><span>Contract total before discounts: {formatMoney(detail.totals.total)}</span></div>
        <p className="text-slate-600">Optional add-on changes apply to future invoices. Issued invoices keep their original amounts.</p>
        <div className="space-y-2">{detail.lines.map((line) => <div key={line.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 p-3"><div><span className="font-medium">{line.description}</span> {line.isAddOn ? <Badge tone={line.isEnabled ? "indigo" : "slate"}>{line.isEnabled ? "Add-on on" : "Add-on off"}</Badge> : <Badge tone="slate">Core</Badge>}<p className="text-xs text-slate-600">{line.quantity} × {formatMoney(line.unitPrice)} = {formatMoney(line.lineAmount)}</p></div>{line.isAddOn && (detail.status === "ACTIVE" || detail.status === "PAUSED") ? <Button variant="secondary" disabled={busy} onClick={() => void change(`/add-ons/${line.id}`, "PATCH", { enabled: !line.isEnabled })}>{line.isEnabled ? "Switch off" : "Switch on"}</Button> : null}</div>)}</div>
        <div className="flex flex-wrap gap-2">{detail.status === "ACTIVE" && detail.allowPause ? <Button variant="secondary" disabled={busy} onClick={() => void change("/pause", "POST", {})}>Pause</Button> : null}{detail.status === "PAUSED" ? <Button variant="secondary" disabled={busy} onClick={() => void change("/resume", "POST", {})}>Resume</Button> : null}{(detail.status === "ACTIVE" || detail.status === "PAUSED") && detail.allowEarlyClose ? <Button variant="danger" disabled={busy} onClick={() => void change("/close", "POST", {})}>Close subscription</Button> : null}{(detail.status === "ACTIVE" || detail.status === "CLOSED") && detail.allowRenewal ? <Button variant="secondary" disabled={busy} onClick={() => void change("/renew", "POST", {}, true)}>Request renewal</Button> : null}</div>
        {notice ? <p role="status" className="rounded bg-green-50 p-2 text-green-800">{notice}</p> : null}
        <ErrorBanner error={detailError} />
      </div> : null}
    </Modal>
  </section>;
}

export function PortalPage() {
  const session = useSession();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "invoices" ? "invoices" : params.get("tab") === "payments" ? "payments" : "subscriptions";
  const openId = Number(params.get("open"));

  return <div className="min-h-screen bg-slate-100">
    <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3"><div className="flex items-center gap-3"><span className="text-sm font-semibold tracking-tight text-slate-900">Subscriptions</span><Badge tone="green">My portal</Badge></div><div className="flex min-w-0 items-center gap-2"><span className="max-w-44 truncate text-sm text-slate-600 sm:max-w-none" title={session.user?.email}>{session.user?.email}</span><Button variant="secondary" onClick={() => { void session.logout(); navigate("/"); }}>Sign out</Button></div></div>
      <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4">{(["subscriptions", "invoices", "payments"] as const).map((item) => <button key={item} type="button" onClick={() => setParams(item === "subscriptions" ? {} : { tab: item })} className={`rounded-t-md border-b-2 px-4 py-2 text-sm font-medium capitalize ${tab === item ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-600 hover:text-slate-900"}`}>{item}</button>)}</nav>
    </header>
    <main className="mx-auto max-w-5xl px-4 py-6">{tab === "subscriptions" ? <CustomerSubscriptions /> : tab === "invoices" ? <CustomerInvoices openId={Number.isSafeInteger(openId) && openId > 0 ? openId : null} /> : <CustomerPayments onInvoice={(id) => setParams({ tab: "invoices", open: String(id) })} />}</main>
  </div>;
}
