import { PageShell } from "../../components/PageShell";
import { concepts } from "../../lib/app-data";
import { NotFoundPage } from "../NotFoundPage";

export function ConceptDetailPage({ slug }: { slug: string }) {
  const concept = concepts.find((candidate) => candidate.slug === slug);
  if (!concept) return <NotFoundPage />;

  return (
    <PageShell
      eyebrow="Concept"
      title={concept.title}
      body={concept.body}
      back={{
        label: "Back to Concepts",
        href: "/concepts"
      }}
    />
  );
}
