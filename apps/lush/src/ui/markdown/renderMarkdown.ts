import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import go from "highlight.js/lib/languages/go";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import shell from "highlight.js/lib/languages/shell";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import katex from "katex";
import "katex/dist/katex.min.css";
import { marked, type Tokens } from "marked";

const allowedTags = new Set([
  "A",
  "ANNOTATION",
  "ANNOTATION-XML",
  "BLOCKQUOTE",
  "BR",
  "CODE",
  "DEL",
  "EM",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "HR",
  "LI",
  "MATH",
  "MFRAC",
  "MI",
  "MLABELEDTR",
  "MN",
  "MO",
  "MPADDED",
  "MPHANTOM",
  "MROOT",
  "MROW",
  "MSEMANTICS",
  "MSPACE",
  "MSQRT",
  "MSTYLE",
  "MSUB",
  "MSUP",
  "MSUBSUP",
  "MTABLE",
  "MTD",
  "MTEXT",
  "MTR",
  "MUNDER",
  "MUNDEROVER",
  "OL",
  "P",
  "PRE",
  "SEMANTICS",
  "SPAN",
  "STRONG",
  "TABLE",
  "TBODY",
  "TD",
  "TH",
  "THEAD",
  "TR",
  "UL"
]);

const allowedClassPattern =
  /^(hljs|hljs-[a-z0-9_-]+|language-[a-z0-9_+-]+|katex|katex-display|katex-html|katex-mathml|base|strut|mord|mop|mbin|mrel|mopen|mclose|mpunct|minner|mspace|msupsub|vlist-t[0-9]*|vlist-r|vlist|vlist-s|pstrut|sizing|reset-size[0-9]+|size[0-9]+|delimsizing|delim-size[0-9]+|nulldelimiter|accent|accent-body|mfrac|frac-line|sqrt|sqrt-sign|sqrt-line|mroot|mtable|col-align-[a-z]+|arraycolsep|rule|llap|rlap|clap|thinbox|mllap|mrlap|text|mathnormal|mathit|mathrm|mainrm|amsrm|mathdefault|mathbb|mathcal|mathfrak|mathtt|mathscr|mathsf|mathbf|boldsymbol|mtight|large-op|op-symbol|newline)$/i;

registerHighlightLanguages();

marked.use({
  async: false,
  breaks: true,
  gfm: true,
  renderer: {
    code(token: Tokens.Code) {
      const language = normalizeLanguage(token.lang);
      const highlighted = highlightCode(token.text, language);
      const languageClass = language
        ? ` language-${escapeAttribute(language)}`
        : "";

      return `<pre><code class="hljs${languageClass}">${highlighted}</code></pre>`;
    }
  },
  extensions: [
    {
      name: "blockMath",
      level: "block",
      start(src) {
        return src.match(/\$\$/)?.index;
      },
      tokenizer(src) {
        const match = /^(?:\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\])(?:\n|$)/.exec(
          src
        );
        if (!match) {
          return undefined;
        }

        return {
          type: "blockMath",
          raw: match[0],
          text: (match[1] ?? match[2]).trim()
        };
      },
      renderer(token) {
        return renderMath(String(token.text ?? ""), true);
      }
    },
    {
      name: "inlineMath",
      level: "inline",
      start(src) {
        return src.match(/\$/)?.index;
      },
      tokenizer(src) {
        const match = /^(?:\$([^\s$](?:\\.|[^$\n])*?[^\s$])\$|\\\(([\s\S]+?)\\\))/.exec(
          src
        );
        if (!match) {
          return undefined;
        }

        return {
          type: "inlineMath",
          raw: match[0],
          text: match[1] ?? match[2]
        };
      },
      renderer(token) {
        return renderMath(String(token.text ?? ""), false);
      }
    }
  ]
});

export function renderMarkdown(source: string) {
  return sanitizeHtml(marked.parse(closeDanglingBlocks(source)) as string);
}

function registerHighlightLanguages() {
  hljs.registerLanguage("bash", bash);
  hljs.registerLanguage("css", css);
  hljs.registerLanguage("diff", diff);
  hljs.registerLanguage("go", go);
  hljs.registerLanguage("html", xml);
  hljs.registerLanguage("javascript", javascript);
  hljs.registerLanguage("js", javascript);
  hljs.registerLanguage("json", json);
  hljs.registerLanguage("markdown", markdown);
  hljs.registerLanguage("md", markdown);
  hljs.registerLanguage("py", python);
  hljs.registerLanguage("python", python);
  hljs.registerLanguage("rs", rust);
  hljs.registerLanguage("rust", rust);
  hljs.registerLanguage("sh", shell);
  hljs.registerLanguage("shell", shell);
  hljs.registerLanguage("sql", sql);
  hljs.registerLanguage("ts", typescript);
  hljs.registerLanguage("typescript", typescript);
  hljs.registerLanguage("xml", xml);
  hljs.registerLanguage("yaml", yaml);
  hljs.registerLanguage("yml", yaml);
}

function closeDanglingBlocks(source: string) {
  return closeDanglingMathFence(closeDanglingCodeFence(source));
}

function closeDanglingCodeFence(source: string) {
  const fenceMatches = source.match(/^```/gm);
  return fenceMatches && fenceMatches.length % 2 === 1
    ? `${source}\n\`\`\``
    : source;
}

function closeDanglingMathFence(source: string) {
  const dollarFences = source.match(/^(\s*)\$\$/gm);
  if (dollarFences && dollarFences.length % 2 === 1) {
    return `${source}\n$$`;
  }

  if (source.includes("\\[") && !source.includes("\\]")) {
    return `${source}\n\\]`;
  }

  return source;
}

function sanitizeHtml(html: string) {
  const template = document.createElement("template");
  template.innerHTML = html;
  sanitizeNode(template.content);
  return template.innerHTML;
}

function sanitizeNode(parent: ParentNode) {
  for (const child of [...parent.childNodes]) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      sanitizeElement(child as Element);
    } else if (child.nodeType !== Node.TEXT_NODE) {
      child.remove();
    }
  }
}

function sanitizeElement(element: Element) {
  if (!allowedTags.has(element.tagName)) {
    element.replaceWith(...element.childNodes);
    return;
  }

  for (const attribute of [...element.attributes]) {
    const name = attribute.name.toLowerCase();

    if (element.tagName === "A" && (name === "href" || name === "title")) {
      continue;
    }

    if (
      element.tagName === "MATH" &&
      (name === "xmlns" || name === "display")
    ) {
      continue;
    }

    if (element.tagName === "ANNOTATION" && name === "encoding") {
      continue;
    }

    if (
      (element.tagName === "CODE" ||
        element.tagName === "SPAN" ||
        element.tagName === "MATH" ||
        element.tagName === "ANNOTATION") &&
      name === "class"
    ) {
      sanitizeClassAttribute(element, attribute.value);
      continue;
    }

    if (
      name === "style" &&
      (element.tagName === "SPAN" ||
        element.tagName === "MATH" ||
        element.tagName === "MROW" ||
        element.tagName === "MO" ||
        element.tagName === "MI" ||
        element.tagName === "MN")
    ) {
      sanitizeStyleAttribute(element, attribute.value);
      continue;
    }

    element.removeAttribute(attribute.name);
  }

  if (element.tagName === "A") {
    const href = element.getAttribute("href") ?? "";
    if (!isSafeHref(href)) {
      element.removeAttribute("href");
    }
    element.setAttribute("rel", "noreferrer noopener");
    element.setAttribute("target", "_blank");
  }

  sanitizeNode(element);
}

function isSafeHref(href: string) {
  return /^(https?:|mailto:|#|\/)/i.test(href);
}

function normalizeLanguage(language?: string) {
  return language?.split(/\s+/)[0]?.toLowerCase() ?? "";
}

function highlightCode(code: string, language: string) {
  if (language && hljs.getLanguage(language)) {
    return hljs.highlight(code, {
      language,
      ignoreIllegals: true
    }).value;
  }

  return escapeHtml(code);
}

function renderMath(source: string, displayMode: boolean) {
  try {
    return katex.renderToString(source, {
      displayMode,
      output: "htmlAndMathml",
      strict: "ignore",
      throwOnError: false
    });
  } catch {
    return `<code>${escapeHtml(source)}</code>`;
  }
}

function sanitizeClassAttribute(element: Element, value: string) {
  const classes = value
    .split(/\s+/)
    .filter((className) => allowedClassPattern.test(className));

  if (classes.length > 0) {
    element.setAttribute("class", classes.join(" "));
  } else {
    element.removeAttribute("class");
  }
}

function sanitizeStyleAttribute(element: Element, value: string) {
  const safeDeclarations = value
    .split(";")
    .map((declaration) => declaration.trim())
    .filter((declaration) =>
      /^(height|margin-right|margin-left|top|bottom|vertical-align):\s*[-0-9.]+(em|rem|px)?$/i.test(
        declaration
      )
    );

  if (safeDeclarations.length > 0) {
    element.setAttribute("style", `${safeDeclarations.join("; ")};`);
  } else {
    element.removeAttribute("style");
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttribute(value: string) {
  return value.replace(/[^a-z0-9_+-]/gi, "");
}
