import type { HLJSApi, LanguageFn } from "highlight.js";

const zig: LanguageFn = (hljs: HLJSApi) => {
  const identifier = /[A-Za-z_][A-Za-z0-9_]*/;
  const functionTitle = hljs.regex.concat(
    identifier,
    hljs.regex.lookahead(/\s*\(/)
  );

  return {
    name: "Zig",
    aliases: ["zig"],
    keywords: {
      keyword: [
        "addrspace",
        "align",
        "allowzero",
        "and",
        "anyframe",
        "anytype",
        "asm",
        "async",
        "await",
        "break",
        "callconv",
        "catch",
        "comptime",
        "const",
        "continue",
        "defer",
        "else",
        "enum",
        "errdefer",
        "error",
        "export",
        "extern",
        "fn",
        "for",
        "if",
        "inline",
        "linksection",
        "noalias",
        "nosuspend",
        "opaque",
        "or",
        "orelse",
        "packed",
        "pub",
        "resume",
        "return",
        "struct",
        "suspend",
        "switch",
        "test",
        "threadlocal",
        "try",
        "union",
        "unreachable",
        "usingnamespace",
        "var",
        "volatile",
        "while"
      ],
      literal: ["false", "null", "true", "undefined"],
      type: [
        "anyerror",
        "bool",
        "c_int",
        "c_long",
        "c_longdouble",
        "c_longlong",
        "c_short",
        "c_uint",
        "c_ulong",
        "c_ulonglong",
        "c_ushort",
        "comptime_float",
        "comptime_int",
        "f16",
        "f32",
        "f64",
        "f80",
        "f128",
        "isize",
        "noreturn",
        "type",
        "usize",
        "void"
      ]
    },
    contains: [
      hljs.C_LINE_COMMENT_MODE,
      {
        className: "string",
        begin: /\\\\/,
        end: /$/
      },
      {
        className: "string",
        variants: [
          {
            begin: /"/,
            end: /"/,
            illegal: /\n/,
            contains: [hljs.BACKSLASH_ESCAPE]
          },
          {
            begin: /'(?:\\.|[^\\'])'/,
            relevance: 0
          }
        ]
      },
      {
        className: "number",
        variants: [
          { begin: /\b0b[01_]+/ },
          { begin: /\b0o[0-7_]+/ },
          {
            begin: /\b0x[0-9a-fA-F_]+(?:\.[0-9a-fA-F_]+)?(?:[pP][+-]?[0-9_]+)?/
          },
          { begin: /\b\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d[\d_]*)?/ }
        ],
        relevance: 0
      },
      {
        className: "built_in",
        begin: /@[A-Za-z_][A-Za-z0-9_]*/
      },
      {
        className: "title.function",
        begin: functionTitle,
        relevance: 0
      }
    ]
  };
};

export default zig;
