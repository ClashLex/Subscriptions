import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { asApiError, type ApiError } from "../lib/api.js";
import { loginDestination } from "../lib/navigation.js";
import { useSession } from "../state/session.js";
import { Button, ErrorBanner, Field, TextInput } from "../ui/components.js";
import { AuthShell } from "../ui/AuthShell.js";

/** Admin/Staff land in the back office; customers get the portal. */
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
      navigate(loginDestination(user.role, location.search), { replace: true });
    } catch (caught) {
      setError(asApiError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Sign in" description="Welcome back. Pick up where your subscriptions left off.">
        <ErrorBanner error={error} />
        {flashMessage && !error ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {flashMessage}
          </div>
        ) : null}
        <form className="space-y-5" onSubmit={submit}>
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
        <p className="text-sm">
          <Link className="font-medium text-indigo-600 hover:underline" to="/forgot-password">Forgot password?</Link>
        </p>
        <p className="text-sm text-slate-500">
          New customer?{" "}
          <Link className="font-medium text-indigo-600 hover:underline" to="/register">
            Create an account
          </Link>
        </p>
    </AuthShell>
  );
}
