type Fence = {
  character: "`" | "~";
  length: number;
};

function fenceAtLineStart(line: string): Fence | null {
  const match = /^(?: {0,3})(`{3,}|~{3,})/.exec(line);
  const marker = match?.[1];

  if (!marker) {
    return null;
  }

  return {
    character: marker[0] as Fence["character"],
    length: marker.length,
  };
}

function isFenceClose(line: string, fence: Fence): boolean {
  const match = /^(?: {0,3})(`{3,}|~{3,})[ \t]*$/.exec(line);
  const marker = match?.[1];

  return Boolean(
    marker &&
      marker[0] === fence.character &&
      marker.length >= fence.length
  );
}

function countRun(input: string, index: number, character: string): number {
  let length = 0;

  while (input[index + length] === character) {
    length += 1;
  }

  return length;
}

function findCodeSpanClose(
  input: string,
  start: number,
  markerLength: number
): number {
  let index = start;

  while (index < input.length) {
    const next = input.indexOf("`", index);

    if (next === -1) {
      return -1;
    }

    const runLength = countRun(input, next, "`");

    if (runLength === markerLength) {
      return next;
    }

    index = next + runLength;
  }

  return -1;
}

function isEscaped(input: string, index: number): boolean {
  let slashCount = 0;

  for (let cursor = index - 1; cursor >= 0 && input[cursor] === "\\"; cursor -= 1) {
    slashCount += 1;
  }

  return slashCount % 2 === 1;
}

function findMathClose(input: string, start: number, delimiter: string): number {
  let index = start;

  while (index < input.length) {
    const next = input.indexOf(delimiter, index);

    if (next === -1) {
      return -1;
    }

    if (!isEscaped(input, next)) {
      return next;
    }

    index = next + delimiter.length;
  }

  return -1;
}

function displayMath(inner: string, hasLeadingNewline: boolean, hasTrailingNewline: boolean) {
  const before = hasLeadingNewline ? "" : "\n";
  const after = hasTrailingNewline ? "" : "\n";
  return `${before}$$\n${inner.trim()}\n$$${after}`;
}

/**
 * Converts standard LaTeX math delimiters into Streamdown's math syntax.
 *
 * Code spans and fenced code blocks are intentionally left untouched. An
 * incomplete delimiter is also preserved while a response is streaming.
 */
export function normalizeMarkdownMath(input: string): string {
  let output = "";
  let index = 0;
  let atLineStart = true;
  let fence: Fence | null = null;

  while (index < input.length) {
    if (atLineStart) {
      const newline = input.indexOf("\n", index);
      const lineEnd = newline === -1 ? input.length : newline;
      const line = input.slice(index, lineEnd);

      if (fence) {
        output += line;
        fence = isFenceClose(line, fence) ? null : fence;
        index = lineEnd;
        atLineStart = false;
        continue;
      }

      const openingFence = fenceAtLineStart(line);

      if (openingFence) {
        output += line;
        fence = openingFence;
        index = lineEnd;
        atLineStart = false;
        continue;
      }
    }

    if (input[index] === "\n") {
      output += "\n";
      index += 1;
      atLineStart = true;
      continue;
    }

    atLineStart = false;

    if (input[index] === "`") {
      const markerLength = countRun(input, index, "`");
      const close = findCodeSpanClose(
        input,
        index + markerLength,
        markerLength
      );

      if (close === -1) {
        output += input.slice(index);
        break;
      }

      const end = close + markerLength;
      output += input.slice(index, end);
      index = end;
      continue;
    }

    if (input.startsWith("\\(", index) && !isEscaped(input, index)) {
      const close = findMathClose(input, index + 2, "\\)");

      if (close !== -1) {
        output += `$$${input.slice(index + 2, close).trim()}$$`;
        index = close + 2;
        continue;
      }
    }

    if (input.startsWith("\\[", index) && !isEscaped(input, index)) {
      const close = findMathClose(input, index + 2, "\\]");

      if (close !== -1) {
        output += displayMath(
          input.slice(index + 2, close),
          output.endsWith("\n"),
          input[close + 2] === "\n"
        );
        index = close + 2;
        continue;
      }
    }

    output += input[index];
    index += 1;
  }

  return output;
}
