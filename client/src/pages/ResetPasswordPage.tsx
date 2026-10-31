import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { asApiError, request, type ApiError } from "../lib/api.js";
import { Button, ErrorBanner, Field, TextInput } from "../ui/components.js";
import { AuthShell } from "../ui/AuthShell.js";

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await request("/auth/reset-password", { method: "POST", body: { token, password } });
      navigate("/login", { replace: true, state: { message: "Password updated. Sign in with your new password." } });
    } catch (caught) {
      setError(asApiError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Choose a new password" description="Create a strong password to keep your account secure.">
        {token.length === 0 ? <p className="text-sm text-red-700">This reset link is missing its token.</p> : null}
        <ErrorBanner error={error} />
        <form className="space-y-5" onSubmit={submit}>
          <Field label="New password">
            <TextInput type="password" required autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </Field>
          <p className="text-xs text-slate-500">More than 8 characters with uppercase, lowercase, and a special character.</p>
          <Button type="submit" disabled={busy || token.length === 0} className="w-full">{busy ? "Updating…" : "Update password"}</Button>
        </form>
        <p className="text-sm"><Link className="font-medium text-indigo-600 hover:underline" to="/login">Back to sign in</Link></p>
    </AuthShell>
  );
}
