import { FolderIcon, PinIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApp } from "../../App";
import { Button } from "../../components/ui/button";
import { ProjectDialog } from "../../features/projects/ProjectDialog";

export function ProjectsPage() {
  const app = useApp();
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="mx-auto w-full max-w-5xl px-1 py-2 sm:px-4 sm:py-5">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text)] sm:text-3xl">
            Projects
          </h1>
          <p className="mt-2 text-sm text-[var(--color-muted)]">
            Give related sessions shared instructions, memory, and context.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <PlusIcon data-icon="inline-start" />
          New project
        </Button>
      </header>

      {app.projects.length === 0 ? (
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="mt-8 flex w-full flex-col items-center rounded-xl border border-dashed border-[var(--color-border)] px-6 py-16 text-center transition hover:border-[var(--color-border-strong)] hover:bg-[var(--color-panel)]"
        >
          <FolderIcon className="size-7 text-[var(--color-muted)]" />
          <span className="mt-3 text-sm font-medium text-[var(--color-text)]">
            Create your first project
          </span>
          <span className="mt-1 text-sm text-[var(--color-muted)]">
            Project context is reused across every session inside it.
          </span>
        </button>
      ) : (
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {app.projects.map((project) => (
            <Link
              key={project.id}
              to={`/projects/${encodeURIComponent(project.id)}`}
              className="group rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 transition hover:border-[var(--color-border-strong)] hover:bg-[var(--color-panel-hover)]"
            >
              <div className="flex items-center justify-between gap-3">
                <FolderIcon className="size-5 text-[var(--color-muted)] group-hover:text-[var(--color-text)]" />
                {project.pinnedAt ? <PinIcon className="size-3.5 text-[var(--color-muted)]" /> : null}
              </div>
              <h2 className="mt-6 truncate text-sm font-medium text-[var(--color-text)]">
                {project.name}
              </h2>
              <p className="mt-1 line-clamp-2 min-h-10 text-xs leading-5 text-[var(--color-muted)]">
                {project.instructions || "No project instructions yet."}
              </p>
            </Link>
          ))}
        </div>
      )}

      <ProjectDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Create project"
        description="Projects share instructions and context across related sessions."
        submitLabel="Create"
        onSubmit={async (name) => {
          const project = await app.createUserProject(name);
          navigate(`/projects/${encodeURIComponent(project.id)}`);
        }}
      />
    </div>
  );
}
