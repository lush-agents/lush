import { describe, expect, test } from "bun:test";
import { parseClientEventFrame } from "../apps/lush/src/lib/client-event-stream";

describe("app client event stream", () => {
  test("parses auth refresh events", () => {
    expect(
      parseClientEventFrame(
        'event: auth.refresh_required\ndata: {"type":"auth.refresh_required","reason":"membership_changed"}'
      )
    ).toEqual({
      type: "auth.refresh_required",
      reason: "membership_changed"
    });
  });

  test("ignores unrelated and malformed events", () => {
    expect(parseClientEventFrame("event: message\ndata: {}"))
      .toBeUndefined();
    expect(
      parseClientEventFrame("event: auth.refresh_required\ndata: {")
    ).toBeUndefined();
  });
});
