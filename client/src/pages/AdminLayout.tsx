import { NavLink, Outlet } from "react-router-dom";
import { useSession } from "../state/session.js";
import { Badge, Button } from "../ui/components.js";
import type { ReactNode } from "react";

const NAV_ITEMS: Array<{ to: string; label: string }> = [
  { to: "/admin", label: "Overview" },
  { to: "/admin/products", label: "Products & variants" },
  { to: "/admin/plans", label: "Plans" },
  { to: "/admin/taxes", label: "Taxes" },
  { to: "/admin/templates", label: "Quotation templates" },
  { to: "/admin/subscriptions", label: "Subscriptions" },
  { to: "/admin/invoices", label: "Invoices & billing" },
  { to: "/admin/payments", label: "Payments" },
  { to: "/admin/discounts", label: "Discounts" },
];

export function AdminLayout() {
  const session = useSession();
  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold tracking-tight text-slate-900">Subscriptions</span>
            <Badge tone="indigo">Back office</Badge>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <span className="max-w-24 truncate text-sm text-slate-600 sm:max-w-none" title={session.user?.email}>{session.user?.email}</span>
            <Badge tone={session.isAdmin ? "indigo" : "slate"}>{session.user?.role ?? ""}</Badge>
            <Button variant="secondary" onClick={() => void session.logout()}>
              Sign out
            </Button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/admin"}
              className={({ isActive }) =>
                `rounded-t-md border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "border-indigo-600 text-indigo-700"
                    : "border-transparent text-slate-600 hover:text-slate-900"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}

export function CenteredCard({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md space-y-4 rounded-xl bg-white p-6 text-center shadow-md">
        {children}
      </div>
    </div>
  );
}
