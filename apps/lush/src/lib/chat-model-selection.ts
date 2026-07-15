import type { Session } from "@lush/api-client";

export const chatModelSelectionStateKind = "chat_model_selection";

export function chatModelSelectionState(modelSelection: string) {
  return {
    kind: chatModelSelectionStateKind,
    state: { modelSelection }
  };
}

export function chatModelSelectionFromSession(session: Session | undefined) {
  for (const snapshot of [...(session?.stateSnapshots ?? [])].reverse()) {
    if (
      snapshot.kind !== chatModelSelectionStateKind ||
      !snapshot.state ||
      typeof snapshot.state !== "object"
    ) {
      continue;
    }

    const modelSelection = (snapshot.state as { modelSelection?: unknown })
      .modelSelection;
    if (typeof modelSelection === "string" && modelSelection) {
      return modelSelection;
    }
  }

  return undefined;
}

export function resolveChatModelSelection(options: {
  requestedModelSelection?: string;
  defaultModelSelection: string;
  enabledModelSelections: string[];
}) {
  const enabled = new Set(options.enabledModelSelections);
  if (
    options.requestedModelSelection &&
    enabled.has(options.requestedModelSelection)
  ) {
    return {
      modelSelection: options.requestedModelSelection,
      unavailableModelSelection: undefined
    };
  }

  const modelSelection = enabled.has(options.defaultModelSelection)
    ? options.defaultModelSelection
    : options.enabledModelSelections[0] ?? "";

  return {
    modelSelection,
    unavailableModelSelection: options.requestedModelSelection || undefined
  };
}

export function modelSelectionName(modelSelection: string) {
  const separatorIndex = modelSelection.indexOf(":");
  return separatorIndex === -1
    ? modelSelection
    : modelSelection.slice(separatorIndex + 1);
}
