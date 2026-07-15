import { describe, expect, test } from "bun:test";
import {
  openAIResponsesRequest,
  parseOpenAIResponseStreamLine
} from "../services/inference/src/openai-responses";

describe("OpenAI Responses adapter", () => {
  test("builds a stateless Responses API request", () => {
    expect(
      openAIResponsesRequest("gpt-5.4", [
        { role: "system", content: "Be concise." },
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi" },
        { role: "user", content: "Continue" }
      ])
    ).toEqual({
      model: "gpt-5.4",
      instructions: "Be concise.",
      input: [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi" },
        { role: "user", content: "Continue" }
      ],
      stream: true,
      store: false
    });
  });

  test("parses output text deltas and ignores other SSE lines", () => {
    expect(parseOpenAIResponseStreamLine("event: response.output_text.delta"))
      .toBe("");
    expect(
      parseOpenAIResponseStreamLine(
        'data: {"type":"response.output_text.delta","delta":"hello"}'
      )
    ).toBe("hello");
    expect(
      parseOpenAIResponseStreamLine(
        'data: {"type":"response.completed","response":{}}'
      )
    ).toBe("");
  });

  test("surfaces streamed OpenAI failures", () => {
    expect(() =>
      parseOpenAIResponseStreamLine(
        'data: {"type":"response.failed","response":{"error":{"message":"bad model"}}}'
      )
    ).toThrow("bad model");
  });
});
