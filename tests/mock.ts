// Browser-only preview harness: fakes the Tauri backend so the overlay UI can be
// exercised in a normal browser tab (npm run dev -> /tests/preview.html).
import { emit } from "@tauri-apps/api/event";
import { mockIPC } from "@tauri-apps/api/mocks";

const log: Array<{ cmd: string; args: unknown }> = [];
let settings = { vaultPath: "", workDir: "", allowEdits: false, autoApprove: false, port: 47650 };
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
    default: return null;
  }
}, { shouldMockEvents: true });

Object.assign(window, { __emit: emit, __log: log });
