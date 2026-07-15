# Code Harness Transport Selection

## Dogfood Selection

The first macOS-local release maintains exactly one transport per harness.

| Harness | Selected transport | Session identity and resume | Approval model |
| --- | --- | --- | --- |
| Codex | `codex exec --json` | `thread.started.thread_id`; `codex exec resume` | Policy-only through Codex sandbox configuration |
| Claude Code | `claude --print --output-format stream-json` | `session_id`; `--resume` | Policy-only through `--permission-mode` |
| OpenCode | `opencode run --format json` | `sessionID`; `--session` | Native configured policy; Lush does not pass the bypass flag |

These transports are structured, installed with their respective CLIs, work
with existing subscription authentication, and support a bounded one-process-
per-turn implementation. They are sufficient to validate the shared session,
event, worktree, cancellation, and resume contracts without shipping two
transports for any harness.

## Known Gaps

| Capability | Codex | Claude Code | OpenCode |
| --- | --- | --- | --- |
| Incremental assistant text | Final message in current exec stream | Native deltas | Native text parts |
| Interactive approvals | Not exposed by selected transport | Requires permission callback/MCP integration | Requires server or ACP integration |
| Steering during a turn | Not exposed | Requires streaming input/SDK | Requires server or ACP integration |
| Structured file diffs | Computed from Git workspace | Computed from Git workspace | Computed from Git workspace |
| Rich native session controls | App-server upgrade path | Agent SDK upgrade path | ACP/server upgrade path |

The canonical event model does not encode these limitations. Adapters advertise
capabilities, and the UI exposes only effective policy. A later transport change
must pass the same fixture/conformance corpus and does not justify a parallel
fallback transport by itself.
