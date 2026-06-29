import { authAndInferenceState } from "./001_auth_and_inference_state";
import type { Migration } from "./types";

export const migrations: Migration[] = [
  authAndInferenceState
];
