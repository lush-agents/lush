import { PageShell } from "../../components/PageShell";
import { concepts } from "../../lib/app-data";
import { Link } from "react-router-dom";

export function ConceptsPage() {
  return (
    <PageShell
      eyebrow="First experience"
      title="Concepts"
      body="A quick orientation to the main boundaries that make up Lush. Each concept maps to a service or shared package in the current scaffold."
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {concepts.map((concept) => (
            <Link
              key={concept.slug}
              to={`/concepts/${concept.slug}`}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4 text-left transition hover:border-[var(--color-brand)] hover:bg-[var(--color-panel-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]"
            >
              <h2 className="font-medium text-[var(--color-text)]">
                {concept.title}
              </h2>
              <p className="mt-2 text-sm leading-5 text-[var(--color-muted)]">
                {concept.summary}
              </p>
            </Link>
        ))}
      </div>
    </PageShell>
  );
}
