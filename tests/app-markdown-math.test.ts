import { describe, expect, test } from "bun:test";
import { normalizeMarkdownMath } from "../apps/lush/src/lib/markdown-math";

describe("app markdown math", () => {
  test("normalizes inline LaTeX delimiters without enabling currency syntax", () => {
    expect(
      normalizeMarkdownMath(
        "where \\(\\gamma \\approx 1.02062\\) and the budget is $5"
      )
    ).toBe("where $$\\gamma \\approx 1.02062$$ and the budget is $5");
  });

  test("normalizes display LaTeX delimiters onto their own lines", () => {
    expect(normalizeMarkdownMath("Result:\n\\[ E_k = (\\gamma-1)mc^2 \\]\nDone"))
      .toBe("Result:\n$$\nE_k = (\\gamma-1)mc^2\n$$\nDone");
  });

  test("normalizes an inline display expression as a block", () => {
    expect(normalizeMarkdownMath("Result: \\[E = mc^2\\] Done")).toBe(
      "Result: \n$$\nE = mc^2\n$$\n Done"
    );
  });

  test("leaves fenced and inline code unchanged", () => {
    const markdown = [
      "`\\(inline code\\)` and \\(math\\)",
      "",
      "```tex",
      "\\[fenced code\\]",
      "```",
    ].join("\n");

    expect(normalizeMarkdownMath(markdown)).toBe(
      [
        "`\\(inline code\\)` and $$math$$",
        "",
        "```tex",
        "\\[fenced code\\]",
        "```",
      ].join("\n")
    );
  });

  test("preserves incomplete delimiters while streaming", () => {
    expect(normalizeMarkdownMath("Working: \\(E = mc^")).toBe(
      "Working: \\(E = mc^"
    );
    expect(normalizeMarkdownMath("Working:\n\\[E = mc^")).toBe(
      "Working:\n\\[E = mc^"
    );
  });

  test("does not treat escaped delimiters as math", () => {
    expect(normalizeMarkdownMath(String.raw`Literal \\(not math\\)`)).toBe(
      String.raw`Literal \\(not math\\)`
    );
  });
});
