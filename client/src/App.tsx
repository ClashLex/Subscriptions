import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { SessionProvider, useSession } from "./state/session.js";
import { PageLoader } from "./ui/components.js";
import { AdminLayout } from "./pages/AdminLayout.js";
import { LoginPage, homeFor } from "./pages/LoginPage.js";
import { RegisterPage } from "./pages/RegisterPage.js";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage.js";
import { ResetPasswordPage } from "./pages/ResetPasswordPage.js";
import { OverviewPage } from "./pages/OverviewPage.js";
import { PortalPage } from "./pages/PortalPage.js";
import { ProductsPage } from "./pages/admin/ProductsPage.js";
import { PlansPage } from "./pages/admin/PlansPage.js";
import { TaxesPage } from "./pages/admin/TaxesPage.js";
import { TemplatesPage } from "./pages/admin/QuotationTemplatesPage.js";
import { SubscriptionsPage } from "./pages/admin/SubscriptionsPage.js";
import type { ReactNode } from "react";
import type { Role } from "./lib/types.js";

function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const session = useSession();
  if (session.status === "loading") {
    return <PageLoader label={"Checking your session\u2026"} />;
  }
  if (session.user === null) {
    return <Navigate to="/login" replace />;
  }
  if (!roles.includes(session.user.role)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

function PublicOnly({ children }: { children: ReactNode }) {
  const session = useSession();
  if (session.status === "loading") {
    return <PageLoader />;
  }
  if (session.user !== null) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

/** "/" resolves by role once the session is known. */
function HomeRedirect() {
  const session = useSession();
  if (session.status === "loading") {
    return <PageLoader />;
  }
  return <Navigate to={homeFor(session.user?.role)} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <Routes>
          <Route
            element={
              <RequireRole roles={["ADMIN", "STAFF"]}>
                <AdminLayout />
              </RequireRole>
            }
          >
            <Route path="/admin" element={<OverviewPage />} />
            <Route path="/admin/products" element={<ProductsPage />} />
            <Route path="/admin/plans" element={<PlansPage />} />
            <Route path="/admin/taxes" element={<TaxesPage />} />
            <Route path="/admin/templates" element={<TemplatesPage />} />
            <Route path="/admin/subscriptions" element={<SubscriptionsPage />} />
          </Route>
          <Route
            path="/portal"
            element={
              <RequireRole roles={["CUSTOMER"]}>
                <PortalPage />
              </RequireRole>
            }
          />
          <Route
            path="/login"
            element={
              <PublicOnly>
                <LoginPage />
              </PublicOnly>
            }
          />
          <Route
            path="/register"
            element={
              <PublicOnly>
                <RegisterPage />
              </PublicOnly>
            }
          />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          {/* "/" resolves by role once the session is known. */}
          <Route path="/" element={<HomeRedirect />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </SessionProvider>
    </BrowserRouter>
  );
}
