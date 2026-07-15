import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export function PageShell(props: {
  eyebrow?: string;
  title: string;
  body: string;
  children?: ReactNode;
  back?: {
    label: string;
    href: string;
  };
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="max-w-2xl">
        {props.back ? (
          <Link
            to={props.back.href}
            className="mb-4 text-sm text-[var(--color-brand-soft)] hover:text-[var(--color-brand-softer)]"
          >
            {props.back.label}
          </Link>
        ) : null}
        {props.eyebrow ? (
          <p className="text-sm font-medium uppercase tracking-wide text-[var(--color-muted)]">
            {props.eyebrow}
          </p>
        ) : null}
        <h1 className={`${props.eyebrow ? "mt-2 " : ""}text-2xl font-semibold text-[var(--color-text)]`}>
          {props.title}
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--color-muted)]">
          {props.body}
        </p>
      </div>
      {props.children}
    </div>
  );
}
