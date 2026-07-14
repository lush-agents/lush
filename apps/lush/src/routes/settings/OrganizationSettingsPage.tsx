import { useEffect, useState, type FormEvent } from "react";
import type {
  OrganizationInvite,
  OrganizationMember,
  UserRole
} from "@lush/api-client";
import { ConfirmDialog } from "../../ui/ConfirmDialog";

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
  const [organizationNameDraft, setOrganizationNameDraft] = useState(
    props.organizationName
  );
  const [organizationNameError, setOrganizationNameError] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<UserRole>("user");
  const [isInviting, setIsInviting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeletingOrganization, setIsDeletingOrganization] = useState(false);
  const isAdmin = props.currentRole === "admin";

  useEffect(() => {
    setOrganizationNameDraft(props.organizationName);
  }, [props.organizationName]);

  const commitOrganizationName = async () => {
    const nextOrganizationName = organizationNameDraft.trim();
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

  const submitInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsInviting(true);

    try {
      await props.onInviteCreate(inviteEmail, inviteRole);
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
    <div className="grid max-w-3xl gap-4">
      <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-md">
            <h2 className="text-sm font-medium text-[var(--color-text)]">
              Organization
            </h2>
            <p className="mt-1 text-sm leading-5 text-[var(--color-muted)]">
              {isAdmin
                ? "Set your organization name."
                : "View your organization name."}
            </p>
          </div>

          <label className="grid min-w-64 gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
              Organization name
            </span>
            <input
              type="text"
              value={organizationNameDraft}
              onInput={(event) =>
                setOrganizationNameDraft(event.currentTarget.value)
              }
              onBlur={() => {
                if (isAdmin) {
                  void commitOrganizationName();
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                }
              }}
              readOnly={!isAdmin}
              placeholder="Example, Inc."
              className={`rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-2 text-sm outline-none transition placeholder:text-[var(--color-muted)] ${
                isAdmin
                  ? "text-[var(--color-text)] hover:border-[var(--color-border-strong)] focus:border-[var(--color-brand)]"
                  : "cursor-default text-[var(--color-muted)]"
              }`}
            />
            {organizationNameError ? (
              <span className="text-xs text-red-300">
                {organizationNameError}
              </span>
            ) : null}
          </label>
        </div>
      </section>

      {props.organizationError ? (
        <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {props.organizationError}
        </p>
      ) : null}

      <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4">
        <div className="grid gap-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-md">
              <h2 className="text-sm font-medium text-[var(--color-text)]">
                Members
              </h2>
              <p className="mt-1 text-sm leading-5 text-[var(--color-muted)]">
                {isAdmin
                  ? "Manage organization access."
                  : "View organization access."}
              </p>
            </div>

            {isAdmin ? (
              <form
                onSubmit={submitInvite}
                className="grid min-w-64 gap-2 sm:grid-cols-[minmax(0,1fr)_7rem_auto]"
              >
                <input
                  type="email"
                  value={inviteEmail}
                  onInput={(event) => setInviteEmail(event.currentTarget.value)}
                  placeholder="name@example.com"
                  required
                  className="rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-2 text-sm text-[var(--color-text)] outline-none transition placeholder:text-[var(--color-muted)] hover:border-[var(--color-border-strong)] focus:border-[var(--color-brand)]"
                />
                <select
                  value={inviteRole}
                  onChange={(event) =>
                    setInviteRole(event.currentTarget.value as UserRole)
                  }
                  className="rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-2 text-sm text-[var(--color-text)] outline-none transition hover:border-[var(--color-border-strong)] focus:border-[var(--color-brand)]"
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
                <button
                  type="submit"
                  disabled={isInviting || !inviteEmail.trim()}
                  className="rounded-md border border-[var(--color-brand)] bg-[var(--color-brand)] px-3 py-2 text-sm font-medium text-white transition hover:border-[var(--color-brand-strong)] hover:bg-[var(--color-brand-strong)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Invite
                </button>
              </form>
            ) : null}
          </div>

          <div className="grid gap-2">
            {props.members.map((member) => (
                <div key={member.membershipId} className="grid gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] p-3 sm:grid-cols-[minmax(0,1fr)_7rem_auto] sm:items-center">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[var(--color-text)]">
                      {member.displayName}
                    </p>
                    <p className="truncate text-xs text-[var(--color-muted)]">
                      {member.email}
                    </p>
                  </div>
                  {isAdmin ? (
                    <select
                      value={member.role}
                      onChange={(event) =>
                        void props.onMemberRoleChange(
                          member.membershipId,
                          event.currentTarget.value as UserRole
                        )
                      }
                      className="rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-2 py-2 text-sm text-[var(--color-text)] outline-none transition hover:border-[var(--color-border-strong)] focus:border-[var(--color-brand)]"
                    >
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                    </select>
                  ) : (
                      <span className="rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-2 py-2 text-sm text-[var(--color-muted)]">
                        {member.role}
                      </span>
                  )}
                  {isAdmin ? (
                    <button
                      type="button"
                      onClick={() => void props.onMemberRemove(member.membershipId)}
                      className="rounded-md border border-[var(--color-border-strong)] px-3 py-2 text-sm text-[var(--color-text)] transition hover:bg-[var(--color-panel-hover)]"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
            ))}
          </div>

          {isAdmin && props.invites.length > 0 ? (
            <div className="grid gap-2">
              <h3 className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
                Invites
              </h3>
              {props.invites.map((invite) => (
                  <div key={invite.id} className="flex min-w-0 items-center justify-between gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[var(--color-text)]">
                        {invite.email}
                      </p>
                      <p className="truncate text-xs text-[var(--color-muted)]">
                        {invite.role} - {invite.status}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-[var(--color-muted)]">
                      {new Date(invite.expiresAt).toLocaleDateString()}
                    </span>
                  </div>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      {isAdmin ? (
        <section className="rounded-lg border border-red-500/50 bg-[var(--color-card)] p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-medium text-[var(--color-text)]">
                Delete organization
              </h2>
              <p className="mt-1 text-sm leading-5 text-[var(--color-muted)]">
                Deletes this organization and all organization-owned state.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDeleteDialogOpen(true)}
              className="self-start rounded-md border border-red-600 bg-red-600 px-3 py-2 text-sm font-medium text-white transition hover:border-red-700 hover:bg-red-700"
            >
              Delete
            </button>
          </div>
        </section>
      ) : null}

      <ConfirmDialog
        open={deleteDialogOpen}
        title="Delete organization?"
        body="This action is permanent. It will delete the organization for every member and remove all organization-owned state."
        confirmLabel="Delete organization"
        pendingConfirmLabel="Deleting..."
        pending={isDeletingOrganization}
        danger
        onCancel={() => setDeleteDialogOpen(false)}
        onConfirm={() => void confirmDeleteOrganization()}
      />
    </div>
  );
}
