import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { asApiError, formatMoney, list, request, type ApiError, type PageMeta } from "../lib/api.js";
import { STATUS_LABELS, type SubscriptionDetail, type SubscriptionListItem } from "../lib/types.js";
import { AppShellHeader } from "../ui/AppShellHeader.js";
import SpotlightCard from "../reactbits/SpotlightCard.js";
import { Badge, Button, ErrorBanner, Modal, PageHeading, Pagination } from "../ui/components.js";
import { EmptyState } from "../ui/EmptyState.js";
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
    <PageHeading eyebrow="My account" title="My subscriptions" subtitle="Your plans, contract details, and next billing dates." />
    <div className="mt-4"><ErrorBanner error={error} /></div>
    {rows === null && !error ? <p className="portal-loading">Loading your subscriptions…</p> : null}
    {rows?.length === 0 ? <EmptyState icon="↗" title="Your first plan starts here." description="This account has no subscriptions yet. A Brightloop team member needs to create a subscription for this customer account before it appears here."><p>Once your plan is confirmed and activated, you can manage add-ons and view billing details from this page.</p></EmptyState> : null}
    {rows && rows.length > 0 ? <div className="subscription-grid">{rows.map((row) => <SpotlightCard className="subscription-card" theme="light" spotlightColor="#b8eaa5" intensity={.45} key={row.id}>
      <div className="subscription-card__top"><span className="subscription-card__number">{row.subscriptionNumber}</span><Badge tone={statusTone(row.status)}>{STATUS_LABELS[row.status]}</Badge></div>
      <h2>{row.planName}</h2>
      <div className="subscription-card__facts"><span>Next billing <strong>{row.nextBillingAt?.slice(0, 10) ?? "Not scheduled"}</strong></span><span>Contract <strong>{row.startDate ?? "—"} → {row.expiryDate ?? "Open ended"}</strong></span></div>
      <Button variant="secondary" onClick={() => void open(row.id)}>Manage</Button>
    </SpotlightCard>)}</div> : null}
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
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "invoices" ? "invoices" : params.get("tab") === "payments" ? "payments" : "subscriptions";
  const openId = Number(params.get("open"));

  return <div className="app-shell app-shell--portal">
    <AppShellHeader mode="customer" />
    <main className="app-main app-main--portal">
      <div className="portal-intro"><div><p className="eyebrow"><span className="eyebrow__line" /> Your account</p><h1>Good to have you here<span>.</span></h1><p>Everything about your plans, invoices, and payments in one place.</p></div><span className="portal-intro__tag">MY BRIGHTLOOP</span></div>
      {tab === "subscriptions" ? <CustomerSubscriptions /> : tab === "invoices" ? <CustomerInvoices openId={Number.isSafeInteger(openId) && openId > 0 ? openId : null} /> : <CustomerPayments onInvoice={(id) => setParams({ tab: "invoices", open: String(id) })} />}
    </main>
    <footer className="app-footer"><span>BRIGHTLOOP / CUSTOMER PORTAL</span><span>Made for a clearer relationship.</span></footer>
  </div>;
}
