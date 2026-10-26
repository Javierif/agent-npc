// Turns a raw hook tool call ("mcp__Claude_Browser__navigate", a long path or URL)
// into a short, readable line for bubbles and session rows.

import { t } from "./i18n";

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** Paths show their file name, URLs their host and path, anything else its first line. */
export function shortDetail(detail: string | null | undefined, max = 48): string {
  const text = (detail ?? "").trim().split("\n")[0];
  if (!text) return "";
  const url = text.match(/^https?:\/\/([^/\s]+)(\/\S*)?$/);
  if (url) return clip(`${url[1]}${url[2] && url[2] !== "/" ? url[2] : ""}`, max);
  if (/^([a-zA-Z]:)?[\\/]/.test(text) && !/\s{2,}/.test(text)) return clip(text.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || text, max);
  return clip(text, max);
}

function mcpName(tool: string): string {
  const [, , ...rest] = tool.split("__");
  return (rest.join(" ") || tool).replace(/[_-]+/g, " ");
}

/** One readable line such as "📖 Leyendo ui.ts"; always starts with an icon. */
export function describeActivity(tool: string | null | undefined, detail: string | null | undefined): string {
  const name = tool || "tool";
  const x = shortDetail(detail);
  switch (name) {
    case "Read": return t("📖 Leyendo {x}", { x });
    case "Write": return t("✍️ Escribiendo {x}", { x });
    case "Edit": case "MultiEdit": case "NotebookEdit": return t("✏️ Editando {x}", { x });
    case "Bash": return t("⚙️ Ejecutando {x}", { x });
    case "Grep": case "Glob": case "LS": return t("🔎 Buscando {x}", { x });
    case "WebFetch": return t("🌐 Abriendo {x}", { x });
    case "WebSearch": return t("🌐 Buscando en la web: {x}", { x });
    case "Task": case "Agent": return t("🤝 Delegando en un subagente");
    default: {
      const label = name.startsWith("mcp__") ? mcpName(name) : name;
      return `🔌 ${label}${x ? ` · ${x}` : ""}`;
    }
  }
}
