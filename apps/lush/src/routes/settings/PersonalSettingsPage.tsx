import { useEffect, useState } from "react";
import { appearanceOptions } from "../../lib/app-data";
import type { Appearance } from "../../lib/types";

export function PersonalSettingsPage(props: {
  pane: "profile" | "appearance";
  email: string;
  displayName: string;
  appearance: Appearance;
  onDisplayNameChange: (displayName: string) => Promise<unknown> | unknown;
  onAppearanceChange: (appearance: Appearance) => void;
}) {
  const [displayNameDraft, setDisplayNameDraft] = useState(
    props.displayName
  );
  const [displayNameError, setDisplayNameError] = useState("");

  useEffect(() => {
    setDisplayNameDraft(props.displayName);
  }, [props.displayName]);

  const commitDisplayName = async () => {
    const nextDisplayName = displayNameDraft.trim();
    setDisplayNameError("");

    if (nextDisplayName === props.displayName) {
      setDisplayNameDraft(nextDisplayName);
      return;
    }

    try {
      await props.onDisplayNameChange(nextDisplayName);
    } catch (error) {
      setDisplayNameDraft(props.displayName);
      setDisplayNameError(
        error instanceof Error ? error.message : "Unable to update display name"
      );
    }
  };

  return (
    <div className="grid max-w-3xl gap-4">
      {props.pane === "profile" ? (
        <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-md">
              <h2 className="text-sm font-medium text-[var(--color-text)]">
                Profile
              </h2>
              <p className="mt-1 text-sm leading-5 text-[var(--color-muted)]">
                Set your display name shown in Lush.
              </p>
            </div>

            <div className="grid min-w-64 gap-3">
              <label className="grid gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
                  Email address
                </span>
                <input
                  type="email"
                  value={props.email}
                  readOnly
                  className="cursor-default rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-2 text-sm text-[var(--color-muted)] outline-none"
                />
              </label>

              <label className="grid gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
                  Display name
                </span>
                <input
                  type="text"
                  value={displayNameDraft}
                  onInput={(event) =>
                    setDisplayNameDraft(event.currentTarget.value)
                  }
                  onBlur={() => void commitDisplayName()}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.currentTarget.blur();
                    }
                  }}
                  placeholder="First Last"
                  className="rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-2 text-sm text-[var(--color-text)] outline-none transition placeholder:text-[var(--color-muted)] hover:border-[var(--color-border-strong)] focus:border-[var(--color-brand)]"
                />
                {displayNameError ? (
                  <span className="text-xs text-red-300">{displayNameError}</span>
                ) : null}
              </label>
            </div>
          </div>
        </section>
      ) : null}

      {props.pane === "appearance" ? (
        <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-md">
              <h2 className="text-sm font-medium text-[var(--color-text)]">
                Appearance
              </h2>
              <p className="mt-1 text-sm leading-5 text-[var(--color-muted)]">
                Choose how Lush renders across this device.
              </p>
            </div>

            <div className="grid min-w-64 gap-2">
              {appearanceOptions.map((option) => (
                  <label
                    key={option.value}
                    className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition ${
                      props.appearance === option.value
                        ? "border-[var(--color-brand)] bg-[var(--color-panel-hover)]"
                        : "border-[var(--color-border)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-panel-hover)]"
                    }`}
                  >
                    <input
                      type="radio"
                      name="appearance"
                      value={option.value}
                      checked={props.appearance === option.value}
                      onChange={() => props.onAppearanceChange(option.value)}
                      className="mt-1 accent-[var(--color-brand)]"
                    />
                    <span>
                      <span className="block text-sm font-medium text-[var(--color-text)]">
                        {option.label}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-[var(--color-muted)]">
                        {option.description}
                      </span>
                    </span>
                  </label>
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
