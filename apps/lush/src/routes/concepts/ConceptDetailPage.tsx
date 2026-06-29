import { PageShell } from "../../components/PageShell";
import type { Concept } from "../../lib/types";

export function ConceptDetailPage(props: {
  concept: Concept;
  onNavigate: (href: string) => void;
}) {
  return (
    <PageShell
      eyebrow="Concept"
      title={props.concept.title}
      body={props.concept.body}
      back={{
        label: "Back to Concepts",
        href: "/concepts"
      }}
      onNavigate={props.onNavigate}
    />
  );
}
