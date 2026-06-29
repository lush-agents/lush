import { PageShell } from "../components/PageShell";

export function NotFoundPage(props: { onNavigate: (href: string) => void }) {
  return (
    <PageShell
      eyebrow="Missing route"
      title="Nothing here yet"
      body="This placeholder app only knows about the main workspace routes, account routes, and concept pages."
    >
      <button
        type="button"
        onClick={() => props.onNavigate("/concepts")}
        class="mt-5 rounded-md border border-[var(--color-border-strong)] px-3 py-2 text-sm text-[var(--color-text)] hover:border-[var(--color-brand)] hover:bg-[var(--color-panel-hover)]"
      >
        Open Concepts
      </button>
    </PageShell>
  );
}
