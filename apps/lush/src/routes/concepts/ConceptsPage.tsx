import { For } from "solid-js";
import { PageShell } from "../../components/PageShell";
import { concepts } from "../../lib/app-data";

export function ConceptsPage(props: { onNavigate: (href: string) => void }) {
  return (
    <PageShell
      eyebrow="First experience"
      title="Concepts"
      body="A quick orientation to the main boundaries that make up Lush. Each concept maps to a service or shared package in the current scaffold."
    >
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <For each={concepts}>
          {(concept) => (
            <button
              type="button"
              onClick={() => props.onNavigate(`/concepts/${concept.slug}`)}
              class="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4 text-left transition hover:border-[var(--color-brand)] hover:bg-[var(--color-panel-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]"
            >
              <h2 class="font-medium text-[var(--color-text)]">
                {concept.title}
              </h2>
              <p class="mt-2 text-sm leading-5 text-[var(--color-muted)]">
                {concept.summary}
              </p>
            </button>
          )}
        </For>
      </div>
    </PageShell>
  );
}
