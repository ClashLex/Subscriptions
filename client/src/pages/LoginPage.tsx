import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { asApiError, type ApiError } from "../lib/api.js";
import { useSession } from "../state/session.js";
import { Button, ErrorBanner, Field, TextInput } from "../ui/components.js";
import type { Role } from "../lib/types.js";

/** Admin/Staff land in the back office; customers get the portal. */
export function homeFor(role: Role | undefined): string {
  return role === "CUSTOMER" ? "/portal" : "/admin";
}

export function LoginPage() {
  const session = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  const flashMessage = (location.state as { message?: string } | null)?.message ?? null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = await session.login(email.trim(), password);
      navigate(homeFor(user.role), { replace: true });
    } catch (caught) {
      setError(asApiError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-sm space-y-4 rounded-xl bg-white p-6 shadow-md">
        <div className="space-y-1 text-center">
          <h1 className="text-xl font-semibold text-slate-900">Sign in</h1>
          <p className="text-sm text-slate-500">Subscriptions management</p>
        </div>
        <ErrorBanner error={error} />
        {flashMessage && !error ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {flashMessage}
          </div>
        ) : null}
        <form className="space-y-3" onSubmit={submit}>
          <Field label="Email">
            <TextInput
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
          <Field label="Password">
            <TextInput
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Signing in\u2026" : "Sign in"}
          </Button>
        </form>
        <p className="text-center text-sm">
          <Link className="font-medium text-indigo-600 hover:underline" to="/forgot-password">Forgot password?</Link>
        </p>
        <p className="text-center text-sm text-slate-500">
          New customer?{" "}
          <Link className="font-medium text-indigo-600 hover:underline" to="/register">
            Create an account
          </Link>
        </p>
      </div>
    </main>
  );
}
