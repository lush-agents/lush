import {
  requestPasswordReset,
  resetPassword,
  verifyEmail
} from "@lush/api-client";
import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import logoUrl from "../assets/lush-logo.svg?url";
import { resolveApiBaseUrl } from "../lib/app-data";

type RecoveryMode = "verify" | "forgot" | "reset";

export function AccountRecoveryPage({ mode }: { mode: RecoveryMode }) {
  const apiBaseUrl = resolveApiBaseUrl();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] =
    useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("submitting");
    setMessage("");

    try {
      if (mode === "verify") {
        if (!token) {
          throw new Error("This verification link is invalid or has expired.");
        }
        await verifyEmail(apiBaseUrl, { token });
        setStatus("success");
        setMessage("Email verified. You can now sign in.");
        return;
      }

      if (mode === "forgot") {
        await requestPasswordReset(apiBaseUrl, { email });
        setStatus("success");
        setMessage("If that account exists, a password reset link has been sent.");
        return;
      }

      if (!token) {
        throw new Error("This password reset link is invalid or has expired.");
      }
      await resetPassword(apiBaseUrl, { token, password });
      navigate("/sign-in", {
        replace: true,
        state: { notice: "Password reset. Sign in with your new password." }
      });
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Unable to complete request");
    }
  };

  const title =
    mode === "verify"
      ? "Verify email"
      : mode === "forgot"
        ? "Reset password"
        : "Choose a new password";

  return (
    <section className="flex h-screen items-center justify-center px-6">
      <form
        onSubmit={submit}
        className="grid w-full max-w-sm gap-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-5"
      >
        <div className="flex items-center gap-3">
          <img src={logoUrl} alt="Lush" className="h-9 w-9" />
          <div>
            <h1 className="text-base font-semibold text-[var(--color-text)]">Lush</h1>
            <p className="text-sm text-[var(--color-muted)]">{title}</p>
          </div>
        </div>

        {mode === "forgot" ? (
          <label className="grid gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.currentTarget.value)}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-brand)]"
              required
            />
          </label>
        ) : null}

        {mode === "reset" ? (
          <label className="grid gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">New password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.currentTarget.value)}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-brand)]"
              minLength={8}
              maxLength={512}
              required
            />
          </label>
        ) : null}

        {message ? (
          <p className={`rounded-md border px-3 py-2 text-sm ${
            status === "error"
              ? "border-red-500/40 bg-red-500/10 text-red-300"
              : "border-[var(--color-border)] bg-[var(--color-panel)] text-[var(--color-muted)]"
          }`}>
            {message}
          </p>
        ) : null}

        {status !== "success" ? (
          <button
            type="submit"
            disabled={status === "submitting"}
            className="rounded-md border border-[var(--color-brand)] bg-[var(--color-brand)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {status === "submitting"
              ? "Submitting..."
              : mode === "verify"
                ? "Verify my email"
                : mode === "forgot"
                  ? "Send reset link"
                  : "Reset password"}
          </button>
        ) : null}

        <Link to="/sign-in" className="text-center text-sm text-[var(--color-muted)] hover:text-[var(--color-text)]">
          Back to sign in
        </Link>
      </form>
    </section>
  );
}
