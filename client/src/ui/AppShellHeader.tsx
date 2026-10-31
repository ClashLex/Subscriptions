import type { ComponentProps } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import PillNav from "../reactbits/PillNav.js";
import { useSession } from "../state/session.js";
import { BrandMark } from "./BrandMark.js";
import { Button } from "./components.js";

const adminItems = [
  { label: "Overview", href: "/admin" },
  { label: "Products", href: "/admin/products" },
  { label: "Plans", href: "/admin/plans" },
  { label: "Taxes", href: "/admin/taxes" },
  { label: "Templates", href: "/admin/templates" },
  { label: "Subscriptions", href: "/admin/subscriptions" },
  { label: "Invoices", href: "/admin/invoices" },
  { label: "Payments", href: "/admin/payments" },
  { label: "Discounts", href: "/admin/discounts" },
];

const customerItems = [
  { label: "Subscriptions", href: "/portal" },
  { label: "Invoices", href: "/portal?tab=invoices" },
  { label: "Payments", href: "/portal?tab=payments" },
];

function RouterLink({ href, ...props }: ComponentProps<"a">) {
  return <Link to={href ?? "/"} {...props} />;
}

export function AppShellHeader({ mode }: { mode: "admin" | "customer" }) {
  const session = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const items = mode === "admin" ? adminItems : customerItems;
  const tab = new URLSearchParams(location.search).get("tab");
  const activeHref = mode === "admin" ? location.pathname : tab === "invoices" || tab === "payments" ? `/portal?tab=${tab}` : "/portal";

  return (
    <header className="app-header">
      <div className="app-header__inner">
        <div className="app-header__identity">
          <Link className="app-wordmark" to={mode === "admin" ? "/admin" : "/portal"} aria-label="Brightloop home">
            <BrandMark size={34} />
            <span><strong>brightloop</strong><small>subscriptions</small></span>
          </Link>
          <span className="app-header__division">{mode === "admin" ? "Workspace" : "Customer portal"}</span>
        </div>
        <div className="app-header__nav">
          <PillNav
            logo={<BrandMark size={20} />}
            logoAlt="Brightloop home"
            logoHref={mode === "admin" ? "/admin" : "/portal"}
            items={items}
            activeHref={activeHref}
            linkComponent={RouterLink}
            theme="dark"
            itemStyle="pill"
            hoverEffect="fill"
            indicator="dot"
            layout="split"
            surface="glass"
            size="sm"
            barColor="rgba(255,255,255,0.09)"
            textColor="#d6e7d4"
            highlightColor="#bcf56d"
            highlightTextColor="#183126"
            bounce={0.3}
            stretch={0.5}
            collapse="auto"
            intro={false}
            ariaLabel={mode === "admin" ? "Workspace navigation" : "Customer navigation"}
          />
        </div>
        <div className="app-header__account">
          <span className="app-account-avatar" aria-hidden="true">{session.user?.email?.slice(0, 1).toUpperCase() ?? "?"}</span>
          <span className="app-header__account-text"><strong>{session.user?.role === "ADMIN" ? "Administrator" : session.user?.role === "STAFF" ? "Team member" : "Customer"}</strong><small title={session.user?.email}>{session.user?.email}</small></span>
          <Button variant="ghost" className="app-header__signout" onClick={() => { void session.logout(); navigate("/"); }}>Sign out</Button>
        </div>
      </div>
    </header>
  );
}
