// Run with: npm run test:ui
import assert from "node:assert/strict";
import { test } from "node:test";

import { firstLine, parseInline, parseMarkdown } from "../src/markdown.ts";

test("inline: bold, italic, code and links, with plain text around them", () => {
  assert.deepEqual(parseInline("a **b** `c` *d* [e](http://x.y) f"), [
    { kind: "text", text: "a " },
    { kind: "bold", children: [{ kind: "text", text: "b" }] },
    { kind: "text", text: " " },
    { kind: "code", text: "c" },
    { kind: "text", text: " " },
    { kind: "italic", children: [{ kind: "text", text: "d" }] },
    { kind: "text", text: " " },
    { kind: "link", text: "e", url: "http://x.y" },
    { kind: "text", text: " f" },
  ]);
  assert.deepEqual(parseInline("snake_case and 2 * 3 * 4"), [{ kind: "text", text: "snake_case and 2 * 3 * 4" }]);
});

test("blocks: headings, lists, code fences, tables and paragraphs", () => {
  const blocks = parseMarkdown([
    "## Title", "", "first line", "second line", "", "- one", "- **two**", "", "1. a", "2) b", "",
    "```ts", "const x = 1;", "```", "", "| h1 | h2 |", "|----|----|", "| a | b |", "", "> quoted", "", "---",
  ].join("\n"));
  assert.deepEqual(blocks.map((b) => b.kind), ["heading", "paragraph", "list", "list", "code", "table", "quote", "rule"]);
  assert.equal(blocks[0].level, 2);
  assert.equal(blocks[1].lines.length, 2, "soft line breaks are kept");
  assert.equal(blocks[2].ordered, false);
  assert.equal(blocks[3].ordered, true);
  assert.equal(blocks[4].text, "const x = 1;");
  assert.equal(blocks[5].rows.length, 2, "the separator row is dropped");
});

test("firstLine gives plain text without Markdown marks", () => {
  assert.equal(firstLine("**Documentación.** `doc-keeper` actualizó [README](http://x.y)\n\nmás"), "Documentación. doc-keeper actualizó README");
  assert.equal(firstLine("## Título\ntexto"), "Título");
  assert.equal(firstLine("- uno\n- dos"), "uno");
  assert.equal(firstLine(""), "");
});

test("an unfinished code fence and raw HTML stay plain content", () => {
  const [code] = parseMarkdown("```\nopen block");
  assert.deepEqual(code, { kind: "code", text: "open block" });
  const [p] = parseMarkdown("<img src=x onerror=alert(1)>");
  assert.deepEqual(p, { kind: "paragraph", lines: [[{ kind: "text", text: "<img src=x onerror=alert(1)>" }]] });
});
