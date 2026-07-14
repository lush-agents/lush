import logoUrl from "../../assets/lush-logo.svg?url";
import {
  Suggestion,
  Suggestions
} from "../ai-elements/suggestion";

const suggestionPrompts = [
  { prompt: "Review a design doc", mode: "Work", integrations: ["Drive", "GitHub"] },
  { prompt: "Add docstrings to a file", mode: "Code", integrations: ["GitHub"] },
  { prompt: "Think through an architecture decision", mode: "Chat", integrations: [] }
];

export function EmptyChatState(props: {
  greeting: string;
  onUseSuggestion: (prompt: string) => void;
}) {
  return (
    <div className="flex min-h-[58vh] flex-col justify-center gap-10 py-10">
      <div className="flex flex-wrap items-center justify-center gap-4 text-center">
        <img src={logoUrl} alt="Lush" className="h-10 w-10 shrink-0" />
        <h1 className="text-4xl font-medium leading-tight text-[var(--color-text)]">
          {props.greeting}
        </h1>
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        <section>
          <h2 className="text-sm font-medium text-[var(--color-muted)]">Active tasks</h2>
          <p className="mt-3 max-w-sm text-sm leading-6 text-[var(--color-muted)]">
            Kick off a few agent tasks at once. They can run in parallel and updates will appear here.
          </p>
          <button
            type="button"
            onClick={() => props.onUseSuggestion("Help me plan a work task")}
            className="mt-3 text-sm font-medium text-[var(--color-subtle)] underline decoration-[var(--color-border-strong)] underline-offset-4 hover:text-[var(--color-text)]"
          >
            Try it with Work
          </button>
        </section>

        <section>
          <h2 className="text-sm font-medium text-[var(--color-muted)]">Ideas for you</h2>
          <Suggestions className="mt-3 w-full max-w-full flex-wrap whitespace-normal">
            {suggestionPrompts.map((suggestion) => (
              <Suggestion
                key={suggestion.prompt}
                suggestion={suggestion.prompt}
                onClick={props.onUseSuggestion}
                className="h-auto min-h-9 whitespace-normal text-left"
              >
                {suggestion.prompt}
              </Suggestion>
            ))}
          </Suggestions>
        </section>
      </div>
    </div>
  );
}
