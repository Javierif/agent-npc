// Small Markdown subset for Claude's replies: headings, lists, code, tables, quotes and
// bold / italic / inline code / links. It builds DOM nodes (never innerHTML), so the text
// of a reply can not inject markup.

export type Inline =
  | { kind: "text"; text: string }
  | { kind: "code"; text: string }
  | { kind: "bold"; children: Inline[] }
  | { kind: "italic"; children: Inline[] }
  | { kind: "link"; text: string; url: string };

export type Block =
  | { kind: "heading"; level: number; inline: Inline[] }
  | { kind: "paragraph"; lines: Inline[][] }
  | { kind: "list"; ordered: boolean; items: Inline[][] }
  | { kind: "code"; text: string }
  | { kind: "quote"; lines: Inline[][] }
  | { kind: "table"; rows: Inline[][][] }
  | { kind: "rule" };

const INLINE = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\s][^*\n]*\*)|(\[[^\]\n]+\]\([^)\s]+\))/g;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    const start = m.index ?? 0;
    if (start > last) out.push({ kind: "text", text: text.slice(last, start) });
    const token = m[0];
    if (m[1]) out.push({ kind: "code", text: token.slice(1, -1) });
    else if (m[2]) out.push({ kind: "bold", children: parseInline(token.slice(2, -2)) });
    else if (m[3]) out.push({ kind: "italic", children: parseInline(token.slice(1, -1)) });
    else {
      const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/)!;
      out.push({ kind: "link", text: link[1], url: link[2] });
    }
    last = start + token.length;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  return out;
}

const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const isTableLine = (line: string) => /^\s*\|.*\|\s*$/.test(line);
const isTableSeparator = (line: string) => /^\s*\|[\s:|-]+\|\s*$/.test(line);

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  const startsBlock = (line: string) =>
    /^```/.test(line) || /^#{1,6}\s/.test(line) || BULLET.test(line) || NUMBERED.test(line) || isTableLine(line) || /^>\s?/.test(line) || /^\s*([-*_])\1{2,}\s*$/.test(line);

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") { i++; continue; }

    if (/^```/.test(line)) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) body.push(lines[i++]);
      i++; // closing fence (or the end of an unfinished block)
      blocks.push({ kind: "code", text: body.join("\n") });
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1].length, inline: parseInline(heading[2].trim()) });
      i++;
      continue;
    }
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) { blocks.push({ kind: "rule" }); i++; continue; }

    if (BULLET.test(line) || NUMBERED.test(line)) {
      const ordered = !BULLET.test(line);
      const items: Inline[][] = [];
      while (i < lines.length) {
        const match = (ordered ? NUMBERED : BULLET).exec(lines[i]);
        if (!match) break;
        items.push(parseInline(match[1].trim()));
        i++;
      }
      blocks.push({ kind: "list", ordered, items });
      continue;
    }
    if (isTableLine(line)) {
      const rows: Inline[][][] = [];
      while (i < lines.length && isTableLine(lines[i])) {
        if (!isTableSeparator(lines[i])) {
          rows.push(lines[i].trim().replace(/^\||\|$/g, "").split("|").map((cell) => parseInline(cell.trim())));
        }
        i++;
      }
      blocks.push({ kind: "table", rows });
      continue;
    }
    if (/^>\s?/.test(line)) {
      const quoted: Inline[][] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) quoted.push(parseInline(lines[i++].replace(/^>\s?/, "")));
      blocks.push({ kind: "quote", lines: quoted });
      continue;
    }

    const paragraph: Inline[][] = [];
    while (i < lines.length && lines[i].trim() !== "" && (paragraph.length === 0 || !startsBlock(lines[i]))) {
      paragraph.push(parseInline(lines[i++].trim()));
    }
    blocks.push({ kind: "paragraph", lines: paragraph });
  }
  return blocks;
}

/** The first meaningful line of a reply as plain text, for one-line previews and bubbles. */
export function firstLine(source: string): string {
  const flat = (parts: Inline[]): string =>
    parts.map((p) => (p.kind === "bold" || p.kind === "italic" ? flat(p.children) : p.text)).join("");
  for (const block of parseMarkdown(source)) {
    switch (block.kind) {
      case "heading": return flat(block.inline);
      case "paragraph": case "quote": return flat(block.lines[0]);
      case "list": return flat(block.items[0]);
      case "table": return flat(block.rows[0].flat(1).flat(1));
      case "code": return block.text.split("\n")[0];
      case "rule": break;
    }
  }
  return "";
}

// ---- DOM ------------------------------------------------------------------------------

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string | null, ...children: Array<Node | string>) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.append(...children);
  return node;
};

function inlineNodes(parts: Inline[]): Node[] {
  return parts.map((part): Node => {
    switch (part.kind) {
      case "text": return document.createTextNode(part.text);
      case "code": return el("code", "md-code", part.text);
      case "bold": return el("strong", null, ...inlineNodes(part.children));
      case "italic": return el("em", null, ...inlineNodes(part.children));
      // Links are shown, not followed: the overlay is not a browser.
      case "link": return Object.assign(el("span", "md-link", part.text), { title: part.url });
    }
  });
}

function withBreaks(lines: Inline[][]): Node[] {
  return lines.flatMap((line, index) => [...(index ? [document.createElement("br")] : []), ...inlineNodes(line)]);
}

export function renderMarkdown(source: string): HTMLElement {
  const root = el("div", "md");
  for (const block of parseMarkdown(source)) {
    switch (block.kind) {
      case "heading": root.append(el("div", `md-h md-h${Math.min(block.level, 3)}`, ...inlineNodes(block.inline))); break;
      case "paragraph": root.append(el("p", null, ...withBreaks(block.lines))); break;
      case "list": root.append(el(block.ordered ? "ol" : "ul", null, ...block.items.map((item) => el("li", null, ...inlineNodes(item))))); break;
      case "code": root.append(el("pre", "md-pre", el("code", null, block.text))); break;
      case "quote": root.append(el("blockquote", null, ...withBreaks(block.lines))); break;
      case "rule": root.append(el("hr", null)); break;
      case "table":
        root.append(el("table", "md-table", ...block.rows.map((row, r) =>
          el("tr", null, ...row.map((cell) => el(r === 0 ? "th" : "td", null, ...inlineNodes(cell)))))));
        break;
    }
  }
  return root;
}
