import { authAndInferenceState } from "./001_auth_and_inference_state";
import { sessionState } from "./002_session_state";
import { sessionAgentId } from "./003_session_agent_id";
import type { Migration } from "./types";

export const migrations: Migration[] = [
  authAndInferenceState,
  sessionState,
  sessionAgentId
];
