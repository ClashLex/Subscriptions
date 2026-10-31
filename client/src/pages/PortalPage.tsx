import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { asApiError, list, type ApiError } from "../lib/api.js";
import { STATUS_LABELS, type SubscriptionListItem } from "../lib/types.js";
import { useSession } from "../state/session.js";
import { Badge, Button, ErrorBanner } from "../ui/components.js";

function statusTone(status: SubscriptionListItem["status"]): "green" | "amber" | "slate" | "indigo" {
  if (status === "ACTIVE") return "green";
  if (status === "PAUSED") return "amber";
  if (status === "CLOSED") return "slate";
  return "indigo";
}

/**
 * Customer portal (Phase 4 scope): the customer's own subscriptions, scoped
 * server-side. Invoices and payments arrive with Phases 5–6.
 */
export function PortalPage() {
  const session = useSession();
  const navigate = useNavigate();
  const [rows, setRows] = useState<SubscriptionListItem[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    let cancelled = false;
    void list<SubscriptionListItem>("/subscriptions?pageSize=100")
      .then((response) => {
        if (!cancelled) {
          setRows(response.data);
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(asApiError(caught));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold tracking-tight text-slate-900">Subscriptions</span>
            <Badge tone="green">My portal</Badge>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-600">{session.user?.email}</span>
            <Badge tone="slate">{session.user?.role ?? ""}</Badge>
            <Button
              variant="secondary"
              onClick={() => {
                void session.logout();
                navigate("/");
              }}
            >
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-6">
        <h1 className="text-lg font-semibold text-slate-900">My subscriptions</h1>
        <p className="mt-1 text-sm text-slate-500">
          Quotations you receive, contracts you hold, and billing dates — scoped to your account only.
        </p>

        <div className="mt-4">
          <ErrorBanner error={error} />
        </div>

        {rows === null ? (
          <p className="mt-6 text-sm text-slate-500">{"Loading your subscriptions\u2026"}</p>
        ) : rows.length === 0 ? (
          <p className="mt-6 rounded-lg border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
            No subscriptions yet — your first quotation will appear here once our team sets it up.
          </p>
        ) : (
          <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Number</th>
                  <th className="px-3 py-2">Plan</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Start / expiry</th>
                  <th className="px-3 py-2">Next billing</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-3 py-2 font-mono text-xs font-medium text-indigo-700">{row.subscriptionNumber}</td>
                    <td className="px-3 py-2 text-slate-700">{row.planName}</td>
                    <td className="px-3 py-2">
                      <Badge tone={statusTone(row.status)}>{STATUS_LABELS[row.status]}</Badge>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600">
                      {row.startDate ?? "\u221E"} {"\u2192"} {row.expiryDate ?? "\u221E"}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600">{row.nextBillingAt?.slice(0, 10) ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-6 text-xs text-slate-400">
          Invoices, payment history, and billing-split flows arrive in Phases 5–6.
        </p>
      </main>
    </div>
  );
}
