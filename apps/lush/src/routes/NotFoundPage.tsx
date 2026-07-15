import { PageShell } from "../components/PageShell";
import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <PageShell
      eyebrow="Not found"
      title="We could not find that page"
      body="The page may have moved, or the address may be incorrect."
    >
      <Link
        to="/sessions"
        className="mt-5 rounded-md border border-[var(--color-border-strong)] px-3 py-2 text-sm text-[var(--color-text)] hover:border-[var(--color-brand)] hover:bg-[var(--color-panel-hover)]"
      >
        Back to app
      </Link>
    </PageShell>
  );
}
