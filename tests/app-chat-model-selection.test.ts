import { describe, expect, test } from "bun:test";
import type { Session, SessionStateSnapshot } from "@lush/api-client";
import {
  chatModelSelectionFromSession,
  chatModelSelectionState,
  resolveChatModelSelection
} from "../apps/lush/src/lib/chat-model-selection";

function session(stateSnapshots: SessionStateSnapshot[]): Session {
  return {
    id: "session-1",
    organizationId: "org-1",
    ownerUserId: "user-1",
    title: "Test session",
    agentId: "lush-chat",
    stateBytes: 0,
    version: 1,
    createdAt: "2026-07-14T00:00:00.000Z",
    updatedAt: "2026-07-14T00:00:00.000Z",
    archivedAt: null,
    messages: [],
    stateSnapshots
  };
}

function modelSnapshot(
  id: string,
  modelSelection: string
): SessionStateSnapshot {
  return {
    id,
    sessionId: "session-1",
    ...chatModelSelectionState(modelSelection),
    byteSize: modelSelection.length,
    createdAt: `2026-07-14T00:00:0${id.slice(-1)}.000Z`
  };
}

describe("chat model selection", () => {
  test("persists and rehydrates the newest thread selection", () => {
    const current = session([
      modelSnapshot("state-1", "provider-1:model-a"),
      modelSnapshot("state-2", "provider-2:model-b")
    ]);

    expect(chatModelSelectionFromSession(current)).toBe(
      "provider-2:model-b"
    );
  });

  test("new threads use the enabled organization default", () => {
    expect(
      resolveChatModelSelection({
        defaultModelSelection: "provider-1:model-a",
        enabledModelSelections: [
          "provider-1:model-a",
          "provider-2:model-b"
        ]
      })
    ).toEqual({
      modelSelection: "provider-1:model-a",
      unavailableModelSelection: undefined
    });
  });

  test("falls back explicitly when the saved model is unavailable", () => {
    expect(
      resolveChatModelSelection({
        requestedModelSelection: "provider-2:model-b",
        defaultModelSelection: "provider-1:model-a",
        enabledModelSelections: ["provider-1:model-a"]
      })
    ).toEqual({
      modelSelection: "provider-1:model-a",
      unavailableModelSelection: "provider-2:model-b"
    });
  });

  test("uses the first enabled model when the default is unavailable", () => {
    expect(
      resolveChatModelSelection({
        defaultModelSelection: "provider-1:model-a",
        enabledModelSelections: ["provider-2:model-b"]
      })
    ).toEqual({
      modelSelection: "provider-2:model-b",
      unavailableModelSelection: undefined
    });
  });
});
