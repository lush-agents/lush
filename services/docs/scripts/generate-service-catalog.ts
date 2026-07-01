import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const services = [
  {
    slug: "api",
    title: "API",
    description: "Public API gateway and route aggregation service.",
    readme: "../../api/README.md",
    status: "implemented"
  },
  {
    slug: "authz",
    title: "Authn/z",
    description: "Identity, organization, role, and authorization service.",
    readme: "../../authz/README.md",
    status: "implemented"
  },
  {
    slug: "inference",
    title: "Inference",
    description: "Inference provider and model-routing service.",
    readme: "../../inference/README.md",
    status: "implemented"
  },
  {
    slug: "sessions",
    title: "Sessions",
    description: "Durable session and active work state service.",
    readme: "../../sessions/README.md",
    status: "implemented"
  },
  {
    slug: "agent",
    title: "Agent",
    description: "Agent harness and execution context service.",
    readme: "../../agent/README.md",
    status: "implemented"
  },
  {
    slug: "docs",
    title: "Docs",
    description: "Documentation site service.",
    readme: "../../docs/README.md",
    status: "implemented"
  },
  {
    slug: "artifacts",
    title: "Artifacts",
    description: "Files, uploads, generated assets, and durable work products.",
    status: "stubbed"
  },
  {
    slug: "configuration",
    title: "Configuration",
    description: "Settings, admin controls, environments, and governance configuration.",
    status: "stubbed"
  },
  {
    slug: "events",
    title: "Events",
    description: "Durable append-only event log for system activity.",
    status: "stubbed"
  },
  {
    slug: "notifications",
    title: "Notifications",
    description: "Outbound notification delivery service.",
    status: "stubbed"
  },
  {
    slug: "scheduler",
    title: "Scheduler",
    description: "Deferred actions, recurring loops, reminders, and retry timers.",
    status: "stubbed"
  },
  {
    slug: "skills",
    title: "Skills",
    description: "Publishing, indexing, resolving, and loading agent skills.",
    status: "stubbed"
  },
  {
    slug: "team-chat",
    title: "Team Chat",
    description: "Team chat platform integration service.",
    status: "stubbed"
  },
  {
    slug: "tools",
    title: "Tools",
    description: "Mediated access layer for tools and integrations.",
    status: "stubbed"
  }
] as const;

const scriptDir = dirname(fileURLToPath(import.meta.url));
const outputDir = resolve(scriptDir, "../content/docs/services");
const metaPath = resolve(outputDir, "meta.json");

await mkdir(outputDir, { recursive: true });
await writeFile(
  metaPath,
  `${JSON.stringify(
    {
      title: "Service Catalog",
      pages: services.map((service) => service.slug)
    },
    null,
    2
  )}\n`
);

for (const service of services) {
  const body =
    service.status === "implemented"
      ? stripTopLevelHeading(
          await readFile(resolve(scriptDir, service.readme), "utf8")
        ).trim()
      : "🚧 help wanted 🛠️";
  const outputPath = resolve(outputDir, `${service.slug}.mdx`);

  await writeFile(
    outputPath,
    [
      "---",
      `title: ${JSON.stringify(service.title)}`,
      `description: ${JSON.stringify(service.description)}`,
      "---",
      "",
      service.status === "implemented"
        ? `{/* Generated from services/${service.slug}/README.md. Edit the service README instead. */}`
        : "{/* Stub service placeholder. */}",
      "",
      body,
      ""
    ].join("\n")
  );
}

function stripTopLevelHeading(markdown: string) {
  return markdown.replace(/^# .*(?:\r?\n)+/, "");
}
