import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { asApiError, request, type ApiError } from "../lib/api.js";
import { Button, ErrorBanner, Field, TextInput } from "../ui/components.js";
import { AuthShell } from "../ui/AuthShell.js";

export function RegisterPage() {
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, string> = { email: email.trim(), password };
      if (displayName.trim().length > 0) {
        body.displayName = displayName.trim();
      }
      await request("/auth/register", { method: "POST", body });
      navigate("/login", {
        replace: true,
        state: { message: "Account created. You can sign in now." },
      });
    } catch (caught) {
      setError(asApiError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Create your account" description="Your subscriptions, invoices, and payments are one step away.">
        <ErrorBanner error={error} />
        <form className="space-y-5" onSubmit={submit}>
          <Field label="Display name (optional)">
            <TextInput
              value={displayName}
              autoComplete="name"
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </Field>
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
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>
          <p className="text-xs text-slate-500">
            More than 8 characters with an uppercase letter, a lowercase letter, and a special character.
          </p>
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Creating\u2026" : "Create account"}
          </Button>
        </form>
        <p className="text-sm text-slate-500">
          Already registered?{" "}
          <Link className="font-medium text-indigo-600 hover:underline" to="/login">
            Sign in
          </Link>
        </p>
    </AuthShell>
  );
}
