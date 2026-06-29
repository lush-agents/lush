import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  Show
} from "solid-js";
import type {
  OrganizationInvite,
  OrganizationMember,
  UserRole
} from "@lush/api-client";

export function OrganizationSettingsPage(props: {
  organizationName: string;
  currentRole?: UserRole;
  organizationError: string;
  members: OrganizationMember[];
  invites: OrganizationInvite[];
  onOrganizationNameChange: (
    organizationName: string
  ) => Promise<unknown> | unknown;
  onDeleteOrganization: () => Promise<unknown>;
  onInviteCreate: (
    email: string,
    role: UserRole,
    expiresInDays?: number
  ) => Promise<unknown>;
  onMemberRoleChange: (membershipId: string, role: UserRole) => Promise<unknown>;
  onMemberRemove: (membershipId: string) => Promise<unknown>;
}) {
  const [organizationNameDraft, setOrganizationNameDraft] = createSignal(
    props.organizationName
  );
  const [organizationNameError, setOrganizationNameError] = createSignal("");
  const [inviteEmail, setInviteEmail] = createSignal("");
  const [inviteRole, setInviteRole] = createSignal<UserRole>("user");
  const [isInviting, setIsInviting] = createSignal(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = createSignal(false);
  const [isDeletingOrganization, setIsDeletingOrganization] = createSignal(false);
  const isAdmin = createMemo(() => props.currentRole === "admin");

  createEffect(() => {
    setOrganizationNameDraft(props.organizationName);
  });

  createEffect(() => {
    if (!deleteDialogOpen()) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isDeletingOrganization()) {
        setDeleteDialogOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    onCleanup(() => window.removeEventListener("keydown", handleKeyDown));
  });

  const commitOrganizationName = async () => {
    const nextOrganizationName = organizationNameDraft().trim();
    setOrganizationNameError("");

    if (nextOrganizationName === props.organizationName) {
      setOrganizationNameDraft(nextOrganizationName);
      return;
    }

    try {
      await props.onOrganizationNameChange(nextOrganizationName);
    } catch (error) {
      setOrganizationNameDraft(props.organizationName);
      setOrganizationNameError(
        error instanceof Error
          ? error.message
          : "Unable to update organization name"
      );
    }
  };

  const submitInvite = async (event: SubmitEvent) => {
    event.preventDefault();
    setIsInviting(true);

    try {
      await props.onInviteCreate(inviteEmail(), inviteRole());
      setInviteEmail("");
      setInviteRole("user");
    } finally {
      setIsInviting(false);
    }
  };

  const confirmDeleteOrganization = async () => {
    setIsDeletingOrganization(true);

    try {
      await props.onDeleteOrganization();
      setDeleteDialogOpen(false);
    } finally {
      setIsDeletingOrganization(false);
    }
  };

  return (
    <div class="grid max-w-3xl gap-4">
      <section class="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4">
        <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div class="max-w-md">
            <h2 class="text-sm font-medium text-[var(--color-text)]">
              Organization
            </h2>
            <p class="mt-1 text-sm leading-5 text-[var(--color-muted)]">
              {isAdmin()
                ? "Set your organization name."
                : "View your organization name."}
            </p>
          </div>

          <label class="grid min-w-64 gap-2">
            <span class="text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
              Organization name
            </span>
            <input
              type="text"
              value={organizationNameDraft()}
              onInput={(event) =>
                setOrganizationNameDraft(event.currentTarget.value)
              }
              onBlur={() => {
                if (isAdmin()) {
                  void commitOrganizationName();
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                }
              }}
              readonly={!isAdmin()}
              placeholder="Example, Inc."
              class={`rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-2 text-sm outline-none transition placeholder:text-[var(--color-muted)] ${
                isAdmin()
                  ? "text-[var(--color-text)] hover:border-[var(--color-border-strong)] focus:border-[var(--color-brand)]"
                  : "cursor-default text-[var(--color-muted)]"
              }`}
            />
            <Show when={organizationNameError()}>
              <span class="text-xs text-red-300">
                {organizationNameError()}
              </span>
            </Show>
          </label>
        </div>
      </section>

      <Show when={props.organizationError}>
        <p class="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {props.organizationError}
        </p>
      </Show>

      <section class="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4">
        <div class="grid gap-4">
          <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div class="max-w-md">
              <h2 class="text-sm font-medium text-[var(--color-text)]">
                Members
              </h2>
              <p class="mt-1 text-sm leading-5 text-[var(--color-muted)]">
                {isAdmin()
                  ? "Manage organization access."
                  : "View organization access."}
              </p>
            </div>

            <Show when={isAdmin()}>
              <form
                onSubmit={submitInvite}
                class="grid min-w-64 gap-2 sm:grid-cols-[minmax(0,1fr)_7rem_auto]"
              >
                <input
                  type="email"
                  value={inviteEmail()}
                  onInput={(event) => setInviteEmail(event.currentTarget.value)}
                  placeholder="name@example.com"
                  required
                  class="rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-2 text-sm text-[var(--color-text)] outline-none transition placeholder:text-[var(--color-muted)] hover:border-[var(--color-border-strong)] focus:border-[var(--color-brand)]"
                />
                <select
                  value={inviteRole()}
                  onChange={(event) =>
                    setInviteRole(event.currentTarget.value as UserRole)
                  }
                  class="rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-2 text-sm text-[var(--color-text)] outline-none transition hover:border-[var(--color-border-strong)] focus:border-[var(--color-brand)]"
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
                <button
                  type="submit"
                  disabled={isInviting() || !inviteEmail().trim()}
                  class="rounded-md border border-[var(--color-brand)] bg-[var(--color-brand)] px-3 py-2 text-sm font-medium text-white transition hover:border-[var(--color-brand-strong)] hover:bg-[var(--color-brand-strong)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Invite
                </button>
              </form>
            </Show>
          </div>

          <div class="grid gap-2">
            <For each={props.members}>
              {(member) => (
                <div class="grid gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] p-3 sm:grid-cols-[minmax(0,1fr)_7rem_auto] sm:items-center">
                  <div class="min-w-0">
                    <p class="truncate text-sm font-medium text-[var(--color-text)]">
                      {member.displayName}
                    </p>
                    <p class="truncate text-xs text-[var(--color-muted)]">
                      {member.email}
                    </p>
                  </div>
                  <Show
                    when={isAdmin()}
                    fallback={
                      <span class="rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-2 py-2 text-sm text-[var(--color-muted)]">
                        {member.role}
                      </span>
                    }
                  >
                    <select
                      value={member.role}
                      onChange={(event) =>
                        void props.onMemberRoleChange(
                          member.membershipId,
                          event.currentTarget.value as UserRole
                        )
                      }
                      class="rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-2 py-2 text-sm text-[var(--color-text)] outline-none transition hover:border-[var(--color-border-strong)] focus:border-[var(--color-brand)]"
                    >
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                    </select>
                  </Show>
                  <Show when={isAdmin()}>
                    <button
                      type="button"
                      onClick={() => void props.onMemberRemove(member.membershipId)}
                      class="rounded-md border border-[var(--color-border-strong)] px-3 py-2 text-sm text-[var(--color-text)] transition hover:bg-[var(--color-panel-hover)]"
                    >
                      Remove
                    </button>
                  </Show>
                </div>
              )}
            </For>
          </div>

          <Show when={isAdmin() && props.invites.length > 0}>
            <div class="grid gap-2">
              <h3 class="text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
                Invites
              </h3>
              <For each={props.invites}>
                {(invite) => (
                  <div class="flex min-w-0 items-center justify-between gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] p-3">
                    <div class="min-w-0">
                      <p class="truncate text-sm font-medium text-[var(--color-text)]">
                        {invite.email}
                      </p>
                      <p class="truncate text-xs text-[var(--color-muted)]">
                        {invite.role} - {invite.status}
                      </p>
                    </div>
                    <span class="shrink-0 text-xs text-[var(--color-muted)]">
                      {new Date(invite.expiresAt).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </div>
      </section>

      <Show when={isAdmin()}>
        <section class="rounded-lg border border-red-500/50 bg-[var(--color-card)] p-4">
          <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 class="text-sm font-medium text-[var(--color-text)]">
                Delete organization
              </h2>
              <p class="mt-1 text-sm leading-5 text-[var(--color-muted)]">
                Deletes this organization and all organization-owned state.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDeleteDialogOpen(true)}
              class="self-start rounded-md border border-red-600 bg-red-600 px-3 py-2 text-sm font-medium text-white transition hover:border-red-700 hover:bg-red-700"
            >
              Delete
            </button>
          </div>
        </section>
      </Show>

      <DeleteOrganizationDialog
        open={deleteDialogOpen()}
        isDeleting={isDeletingOrganization()}
        onCancel={() => setDeleteDialogOpen(false)}
        onConfirm={() => void confirmDeleteOrganization()}
      />
    </div>
  );
}

function DeleteOrganizationDialog(props: {
  open: boolean;
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Show when={props.open}>
      <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget && !props.isDeleting) {
            props.onCancel();
          }
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-organization-title"
          class="w-full max-w-md rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-5 shadow-2xl"
        >
          <h2
            id="delete-organization-title"
            class="text-base font-semibold text-[var(--color-text)]"
          >
            Delete organization?
          </h2>
          <p class="mt-3 text-sm leading-6 text-[var(--color-muted)]">
            This action is permanent. It will delete the organization for every
            member and remove all organization-owned state.
          </p>

          <div class="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              disabled={props.isDeleting}
              onClick={props.onCancel}
              class="rounded-md border border-[var(--color-border-strong)] px-3 py-2 text-sm text-[var(--color-text)] transition hover:bg-[var(--color-panel-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={props.isDeleting}
              onClick={props.onConfirm}
              class="rounded-md border border-red-600 bg-red-600 px-3 py-2 text-sm font-medium text-white transition hover:border-red-700 hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {props.isDeleting ? "Deleting..." : "Delete organization"}
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
}
