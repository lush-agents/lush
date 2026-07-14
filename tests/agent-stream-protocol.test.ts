import { describe, expect, test } from "bun:test";
import {
  agentTextEventStream,
  encodeAgentStreamEvent
} from "../services/agent/src/stream-protocol";

describe("agent stream protocol", () => {
  test("frames text chunks with lifecycle events", async () => {
    async function* chunks() {
      yield "world";
    }

    const events = [];
    for await (const event of agentTextEventStream(
      chunks(),
      { done: false, value: "hello " }
    )) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: "response-start" },
      { type: "text-delta", delta: "hello " },
      { type: "text-delta", delta: "world" },
      { type: "response-complete" }
    ]);
  });

  test("encodes one JSON object per line", () => {
    expect(encodeAgentStreamEvent({ type: "text-delta", delta: "hi" })).toBe(
      '{"type":"text-delta","delta":"hi"}\n'
    );
  });
});
