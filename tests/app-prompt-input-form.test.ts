import { describe, expect, test } from "bun:test";
import { resetPromptMessageField } from "../apps/lush/src/lib/prompt-input-form";

describe("prompt input form reset", () => {
  test("clears only the message field and preserves other controls", () => {
    const message = { value: "Send this", defaultValue: "" };
    const model = {
      value: "provider-2:model-b",
      defaultValue: "provider-1:model-a"
    };

    resetPromptMessageField({
      namedItem(name) {
        return name === "message" ? message : model;
      }
    });

    expect(message.value).toBe("");
    expect(model.value).toBe("provider-2:model-b");
  });
});
