import { Outlet } from "react-router-dom";
import { AppShellHeader } from "../ui/AppShellHeader.js";
import { WorkspaceBackground } from "../ui/WorkspaceBackground.js";
import type { ReactNode } from "react";

export function AdminLayout() {
  return (
    <div className="app-shell">
      <WorkspaceBackground />
      <AppShellHeader mode="admin" />
      <main className="app-main"><Outlet /></main>
      <footer className="app-footer"><span>BRIGHTLOOP / SUBSCRIPTIONS</span><span>One workspace for the whole relationship.</span></footer>
    </div>
  );
}

export function CenteredCard({ children }: { children: ReactNode }) {
  return <div className="auth-shell__form-wrap">{children}</div>;
}
