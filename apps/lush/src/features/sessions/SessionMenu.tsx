import type { ProjectSummary } from "@lush/api-client";
import {
  ArchiveIcon,
  CheckIcon,
  FolderInputIcon,
  MoreVerticalIcon,
  PencilIcon,
  PinIcon,
  PinOffIcon
} from "lucide-react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "../../components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from "../../components/ui/dropdown-menu";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import type { SessionItem } from "../../lib/session-organization";
import { ConfirmDialog } from "../../ui/ConfirmDialog";

export function SessionMenu(props: {
  session: SessionItem;
  projects: ProjectSummary[];
  triggerClassName?: string;
  onRename: (title: string) => Promise<unknown>;
  onPinChange: (pinned: boolean) => Promise<unknown>;
  onMoveToProject: (projectId: string | null) => Promise<unknown>;
  onArchive: () => Promise<unknown>;
}) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [title, setTitle] = useState(props.session.title);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const run = async (operation: () => Promise<unknown>, close?: () => void) => {
    setPending(true);
    setError("");
    try {
      await operation();
      close?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update session");
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Session actions for ${props.session.title}`}
            title="Session actions"
            className={props.triggerClassName ?? "flex size-7 items-center justify-center rounded-md text-[var(--color-muted)] transition hover:bg-[var(--color-panel-hover)] hover:text-[var(--color-text)]"}
          >
            <MoreVerticalIcon className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {!props.session.organizationDisabled ? (
            <>
              <DropdownMenuItem
                onSelect={() => {
                  setTitle(props.session.title);
                  setError("");
                  setRenameOpen(true);
                }}
              >
                <PencilIcon />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  void run(() => props.onPinChange(!props.session.pinnedAt))
                }
              >
                {props.session.pinnedAt ? <PinOffIcon /> : <PinIcon />}
                {props.session.pinnedAt ? "Unpin" : "Pin"}
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <FolderInputIcon />
                  Move to project
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="min-w-44">
                  <DropdownMenuItem
                    disabled={!props.session.projectId}
                    onSelect={() =>
                      void run(() => props.onMoveToProject(null))
                    }
                  >
                    {!props.session.projectId ? <CheckIcon /> : null}
                    No project
                  </DropdownMenuItem>
                  {props.projects.map((project) => (
                    <DropdownMenuItem
                      key={project.id}
                      onSelect={() =>
                        void run(() => props.onMoveToProject(project.id))
                      }
                    >
                      {props.session.projectId === project.id ? <CheckIcon /> : null}
                      <span className="truncate">{project.name}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
            </>
          ) : null}
          <DropdownMenuItem
            variant="destructive"
            disabled={props.session.archiveDisabled}
            onSelect={() => {
              setError("");
              setArchiveOpen(true);
            }}
          >
            <ArchiveIcon />
            Archive
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename session</DialogTitle>
            <DialogDescription>
              Choose a title that will remain recognizable in Recents.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const nextTitle = title.trim();
              if (!nextTitle || pending) return;
              void run(() => props.onRename(nextTitle), () => setRenameOpen(false));
            }}
          >
            <Input
              autoFocus
              value={title}
              maxLength={160}
              onChange={(event) => setTitle(event.target.value)}
            />
            {error ? <p className="mt-2 text-xs text-red-500">{error}</p> : null}
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setRenameOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!title.trim() || pending}>
                {pending ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={archiveOpen}
        title="Archive session?"
        body="Archived sessions follow your organization's retention policy."
        confirmLabel="Archive session"
        pendingConfirmLabel="Archiving..."
        pending={pending}
        error={error}
        onCancel={() => setArchiveOpen(false)}
        onConfirm={() => void run(props.onArchive, () => setArchiveOpen(false))}
      />
    </>
  );
}
