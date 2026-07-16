import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useApp } from "../App";
import logoUrl from "../assets/lush-logo.svg?url";

export function OrganizationInvitePage() {
  const app = useApp();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState<"accepted" | "declined">();
  const token = searchParams.get("token") ?? "";

  const respond = async (response: "accepted" | "declined") => {
    setError("");
    setSubmitting(response);

    try {
      await app.respondToInvite(token, response);
      navigate(response === "accepted" ? "/settings/organization" : "/sessions", {
        replace: true
      });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to respond to this invitation"
      );
    } finally {
      setSubmitting(undefined);
    }
  };

  return (
    <section className="flex h-screen items-center justify-center px-6">
      <div className="grid w-full max-w-sm gap-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-5">
        <div className="flex items-center gap-3">
          <img src={logoUrl} alt="Lush" className="h-9 w-9" />
          <div>
            <h1 className="text-base font-semibold text-[var(--color-text)]">
              Organization invitation
            </h1>
            <p className="text-sm text-[var(--color-muted)]">
              Accept or decline this invitation.
            </p>
          </div>
        </div>

        {!token ? (
          <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            This invitation link is invalid.
          </p>
        ) : null}
        {error ? (
          <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={!token || Boolean(submitting)}
            onClick={() => void respond("declined")}
            className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-text)] transition hover:border-[var(--color-border-strong)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting === "declined" ? "Declining..." : "Decline"}
          </button>
          <button
            type="button"
            disabled={!token || Boolean(submitting)}
            onClick={() => void respond("accepted")}
            className="rounded-md border border-[var(--color-brand)] bg-[var(--color-brand)] px-3 py-2 text-sm font-medium text-white transition hover:border-[var(--color-brand-strong)] hover:bg-[var(--color-brand-strong)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting === "accepted" ? "Accepting..." : "Accept"}
          </button>
        </div>
      </div>
    </section>
  );
}
