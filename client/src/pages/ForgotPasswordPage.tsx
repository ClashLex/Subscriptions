import { useState } from "react";
import { Link } from "react-router-dom";
import { asApiError, request, type ApiError } from "../lib/api.js";
import { Button, ErrorBanner, Field, TextInput } from "../ui/components.js";
import { AuthShell } from "../ui/AuthShell.js";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  const [result, setResult] = useState<{ message: string; devUrl?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await request<{ message: string; devUrl?: string }>("/auth/forgot-password", {
        method: "POST",
        body: { email: email.trim() },
      }));
    } catch (caught) {
      setError(asApiError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Reset your password" description="Enter your account email and we’ll send you a secure reset link.">
        <ErrorBanner error={error} />
        {result ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {result.message}
            {result.devUrl ? (
              <p className="mt-2"><a className="font-medium underline" href={result.devUrl}>Open development reset link</a></p>
            ) : null}
          </div>
        ) : null}
        <form className="space-y-5" onSubmit={submit}>
          <Field label="Email">
            <TextInput type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </Field>
          <Button type="submit" disabled={busy} className="w-full">{busy ? "Sending…" : "Send reset link"}</Button>
        </form>
        <p className="text-sm"><Link className="font-medium text-indigo-600 hover:underline" to="/login">Back to sign in</Link></p>
    </AuthShell>
  );
}
