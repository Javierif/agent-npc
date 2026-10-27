// Browser-only preview harness: fakes the Tauri backend so the overlay UI can be
// exercised in a normal browser tab (npm run dev -> /tests/preview.html).
import { emit } from "@tauri-apps/api/event";
import { mockIPC } from "@tauri-apps/api/mocks";

const log: Array<{ cmd: string; args: unknown }> = [];
let settings = { vaultPath: "", workDir: "", allowEdits: false, autoApprove: false, port: 47650, activity: 50, obsidianFavorites: [{ id: "daily-notes:open", label: "Nota diaria" }], brainEnabled: true, brainInjectSessions: false, brainReflect: false, brainPersona: false, brainForget: false, brainExclude: [] as string[] };
let hooks = false;

mockIPC((cmd, args) => {
  log.push({ cmd, args });
  switch (cmd) {
    case "get_settings": return settings;
    case "update_settings": settings = (args as { settings: typeof settings }).settings; return settings;
    case "hooks_installed": return hooks;
    case "install_hooks": hooks = true; return null;
    case "uninstall_hooks": hooks = false; return null;
    case "scan_vault": return [{ file: "Ideas/proyecto.md", line: 4, text: "Resumir las notas de la reunión" }];
    case "detect_vaults": return ["C:/Users/demo/Notes"];
    case "brain_status": return {
      enabled: true, injectSessions: false, hasVault: true, notes: 128, links: 342, tags: 21, builtMs: Date.now(), archived: 2,
      recent: [
        { path: "Claude NPC/Sesiones/2026-10-26 Revisar el presupuesto (abcdef12).md", title: "2026-10-26 Revisar el presupuesto (abcdef12)", kind: "session", mtimeS: 1 },
        { path: "Claude NPC/Memoria/Atlas se entrega en marzo.md", title: "Atlas se entrega en marzo", kind: "memory", mtimeS: 1 },
      ],
    };
    case "brain_search": return [
      { path: "Ideas/Presupuesto.md", title: "Presupuesto", excerpt: "El presupuesto anual del proyecto Atlas", matched: ["presupuesto"], via: null, score: 3 },
      { path: "Atlas.md", title: "Atlas", excerpt: "Plan general de la web nueva", matched: [], via: "Presupuesto", score: 1 },
    ];
    case "brain_suggestions": return [
      { kind: "link", path: "Reunión.md", title: "Reunión", target: "Atlas", line: 3, before: "Hablamos del atlas ayer.", after: "Hablamos del [[Atlas|atlas]] ayer." },
      { kind: "tag", path: "Ideas/Recetas de pasta.md", title: "Recetas de pasta", target: "recetas", line: 0, before: "", after: "tags: [recetas]" },
    ];
    case "brain_apply": return null;
    case "brain_reflect": return { note: "Claude NPC/Reflexiones/2026-10-27 Revisar el presupuesto (abcdef12).md", lessons: 2, decisions: 1, todos: 1, persona: 2, promoted: 1 };
    case "brain_ask": return {
      text: "El presupuesto de **Atlas** se fijó en 12.000 € [[Presupuesto]]. La entrega es en marzo [[Atlas]].",
      sources: [{ title: "Presupuesto", path: "Ideas/Presupuesto.md" }, { title: "Atlas", path: "Atlas.md" }],
    };
    case "brain_weekly": return { note: "Claude NPC/Semanal/Semana 2026-10-26.md", reflections: 4 };
    case "brain_maintenance": return [
      { kind: "stuck", title: "Enviar el informe", path: "Claude NPC/Pendientes.md", days: 21, related: null },
      { kind: "duplicate", title: "Comprobar siempre las cifras del total", path: "Claude NPC/Memoria/Comprobar siempre las cifras del total.md", days: null, related: "Comprobar siempre las cifras totales" },
      { kind: "orphan", title: "Idea suelta", path: "Idea suelta.md", days: null, related: null },
    ];
    case "brain_dream": return { note: "Claude NPC/Sueños/Sueño 2026-10-26.md", principles: 1, habits: 1, conflicts: 1, story: false };
    case "brain_panel": return "Claude NPC/Panel.md";
    case "brain_persona": return { traits: ["Prefiere respuestas cortas y con un toque de humor."], about: ["Trabaja sobre todo por las noches."], values: ["Que se compruebe todo antes de enviar."], pending: 3 };
    case "brain_remember": return "Claude NPC/Memoria/Nota.md";
    case "obsidian_uri": return null;
    case "obsidian_run_command": return null;
    case "obsidian_commands": return [
      { id: "daily-notes:open", name: "Daily notes: Open today's daily note" },
      { id: "switcher:open", name: "Quick switcher: Open quick switcher" },
      { id: "app:open-settings", name: "Open settings" },
      { id: "editor:toggle-bold", name: "Toggle bold" },
    ];
    case "start_task": return 7;
    case "hook_log": return [
      { ms: Date.now() - 2_000, event: "Notification", session: "aaaaaaaa", tool: null, note: "Claude needs your permission to use Bash" },
      { ms: Date.now() - 5_000, event: "PreToolUse", session: "aaaaaaaa", tool: "Bash", note: null },
      { ms: Date.now() - 9_000, event: "UserPromptSubmit", session: "aaaaaaaa", tool: null, note: null },
    ];
    case "answer_question": return true;
    case "resolve_permission": return true;
    case "auth_status": return false;
    case "auth_login": return null;
    case "recent_sessions": return [
      { id: "11111111-2222-3333-4444-555555555555", cwd: "C:/Users/demo/proyecto", title: "Mejora de diseño y física del muñeco", updatedMs: Date.now() - 3_600_000 },
      { id: "66666666-7777-8888-9999-000000000000", cwd: "C:/Users/demo/otro", title: "Sistema de cuevas y nuevo mapa", updatedMs: Date.now() - 86_400_000 },
    ];
    default: return null;
  }
}, { shouldMockEvents: true });

Object.assign(window, { __emit: emit, __log: log });
