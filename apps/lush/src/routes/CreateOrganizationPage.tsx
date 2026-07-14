import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

export function CreateOrganizationPage(props: {
  error: string;
  onCreate: (name: string) => Promise<unknown>;
}) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);

    try {
      await props.onCreate(name);
      setName("");
      navigate("/concepts", { replace: true });
    } catch {
      // The application provider exposes the server message through `error`.
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center py-8">
      <form
        onSubmit={submit}
        className="grid w-full max-w-md gap-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-5"
      >
        <div>
          <h1 className="text-base font-semibold text-[var(--color-text)]">New organization</h1>
          <p className="mt-1 text-sm leading-5 text-[var(--color-muted)]">Create an organization to continue.</p>
        </div>

        <label className="grid gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">Organization name</span>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            placeholder="Example, Inc."
            required
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-2 text-sm text-[var(--color-text)] outline-none transition placeholder:text-[var(--color-muted)] hover:border-[var(--color-border-strong)] focus:border-[var(--color-brand)]"
          />
        </label>

        {props.error ? (
          <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {props.error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={submitting || !name.trim()}
          className="rounded-md border border-[var(--color-brand)] bg-[var(--color-brand)] px-3 py-2 text-sm font-medium text-white transition hover:border-[var(--color-brand-strong)] hover:bg-[var(--color-brand-strong)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Creating..." : "Create organization"}
        </button>
      </form>
    </div>
  );
}
