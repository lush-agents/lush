export type AuthRefreshClientEvent = {
  type: "auth.refresh_required";
  reason: string;
};

export async function readClientEventStream(
  response: Response,
  signal: AbortSignal,
  onEvent: (event: AuthRefreshClientEvent) => Promise<void>
) {
  const reader = response.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (!signal.aborted) {
      const result = await reader.read();
      if (result.done) break;

      buffer += decoder.decode(result.value, { stream: true });
      let separatorIndex = buffer.indexOf("\n\n");
      while (separatorIndex >= 0) {
        const frame = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);
        const event = parseClientEventFrame(frame);
        if (event) await onEvent(event);
        separatorIndex = buffer.indexOf("\n\n");
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export function parseClientEventFrame(
  frame: string
): AuthRefreshClientEvent | undefined {
  let eventName = "message";
  const data: string[] = [];

  for (const line of frame.split(/\r?\n/)) {
    if (!line || line.startsWith(":")) continue;

    const separatorIndex = line.indexOf(":");
    const field = separatorIndex >= 0 ? line.slice(0, separatorIndex) : line;
    const rawValue = separatorIndex >= 0 ? line.slice(separatorIndex + 1) : "";
    const value = rawValue.startsWith(" ") ? rawValue.slice(1) : rawValue;

    if (field === "event") eventName = value;
    if (field === "data") data.push(value);
  }

  if (eventName !== "auth.refresh_required" || data.length === 0) {
    return undefined;
  }

  try {
    const event = JSON.parse(data.join("\n")) as Partial<AuthRefreshClientEvent>;
    return event.type === "auth.refresh_required" &&
      typeof event.reason === "string"
      ? { type: event.type, reason: event.reason }
      : undefined;
  } catch {
    return undefined;
  }
}

export function abortableDelay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true }
    );
  });
}
