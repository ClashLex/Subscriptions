import { useNavigate } from "react-router-dom";
import { CenteredCard } from "./AdminLayout.js";
import { Badge, Button } from "../ui/components.js";
import { useSession } from "../state/session.js";

export function PortalPage() {
  const session = useSession();
  const navigate = useNavigate();

  return (
    <CenteredCard>
      <div className="space-y-1">
        <h1 className="text-lg font-semibold text-slate-900">My subscriptions</h1>
        <p className="text-sm text-slate-500">Customer portal for {session.user?.email}</p>
      </div>
      <div className="flex justify-center gap-2">
        <Badge tone="indigo">{session.user?.role ?? ""}</Badge>
        <Badge tone="amber">{"Phase 6\u20137"}</Badge>
      </div>
      <p className="text-sm text-slate-600">
        Subscriptions, invoices, payment history, and billing-split flows arrive in later phases. The
        catalogue (plans) is already being configured by the back office.
      </p>
      <Button
        variant="secondary"
        onClick={() => {
          void session.logout();
          navigate("/");
        }}
      >
        Sign out
      </Button>
    </CenteredCard>
  );
}
