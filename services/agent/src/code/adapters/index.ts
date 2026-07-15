import type { HarnessId } from "@lush/code";
import { ClaudeAdapter } from "./claude";
import { CodexAdapter } from "./codex";
import { OpenCodeAdapter } from "./opencode";
import type { CodingHarnessAdapter } from "./types";

const adapters: CodingHarnessAdapter[] = [new CodexAdapter(), new ClaudeAdapter(), new OpenCodeAdapter()];

export function listAdapters() { return adapters; }

export function requireAdapter(id: HarnessId) {
  const adapter = adapters.find((candidate) => candidate.id === id);
  if (!adapter) throw new Error(`Unsupported harness: ${id}`);
  return adapter;
}

export { ClaudeLineParser } from "./claude";
export { CodexLineParser } from "./codex";
export { OpenCodeLineParser } from "./opencode";
