// Browser-only preview harness: fakes the Tauri backend so the overlay UI can be
// exercised in a normal browser tab (npm run dev -> /tests/preview.html).
import { emit } from "@tauri-apps/api/event";
import { mockIPC } from "@tauri-apps/api/mocks";

const log: Array<{ cmd: string; args: unknown }> = [];
let settings = { vaultPath: "", workDir: "", allowEdits: false, autoApprove: false, port: 47650, activity: 50 };
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
    case "start_task": return 7;
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
