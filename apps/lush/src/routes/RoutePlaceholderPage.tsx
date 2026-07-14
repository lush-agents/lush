import type { ReactNode } from "react";
import { PageShell } from "../components/PageShell";
import type { Route } from "../lib/types";

export function RoutePlaceholderPage(props: {
  route: Route;
  children?: ReactNode;
}) {
  return (
    <PageShell
      eyebrow={props.route.eyebrow}
      title={props.route.title}
      body={props.route.body}
    >
      {props.children}
    </PageShell>
  );
}
