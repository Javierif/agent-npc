import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface Settings {
  vaultPath: string;
  workDir: string;
  allowEdits: boolean;
  autoApprove: boolean;
  port: number;
  theme: string;
  mini: boolean;
  telegramToken: string;
  telegramChatId: string;
  remoteView: boolean;
  remoteToken: string;
  slackWebhook: string;
  feishuWebhook: string;
  language: string;
}

export interface PetInfo {
  id: string;
  label: string;
}

export interface CustomTheme {
  id: string;
  label: string;
  colors: Record<string, string>;
}

export interface Quota {
  usedPct: number;
  resetsAt: number | null;
}

export interface Usage {
  fiveHour: Quota | null;
  sevenDay: Quota | null;
  contextPct: number | null;
  updatedMs: number;
}

export type SessionState = "idle" | "thinking" | "working" | "waiting" | "attention" | "done" | "error";

export interface Session {
  id: string;
  cwd: string;
  state: SessionState;
  tool: string | null;
  detail: string | null;
  message: string | null;
  subagents: number;
  agent: string;
  updatedMs: number;
}

export interface PermissionRequest {
  id: number;
  sessionId: string;
  cwd: string | null;
  tool: string;
  detail: string;
}

export interface VaultTask {
  file: string;
  line: number;
  text: string;
}

export interface AgentEvent {
  event: string;
  sessionId: string;
  tool: string | null;
  detail: string | null;
  message: string | null;
}

export interface TaskUpdate {
  id: number;
  kind: "start" | "text" | "tool" | "result";
  text?: string;
  tool?: string;
  ok?: boolean;
  note?: string | null;
  cwd?: string;
  vault?: VaultTask | null;
}

export const api = {
  setHitRegions: (regions: Array<{ x: number; y: number; w: number; h: number }>) =>
    invoke("set_hit_regions", { regions }),
  setInteractive: (force: boolean) => invoke("set_interactive", { force }),
  focusWindow: () => invoke("focus_window"),
  getSettings: () => invoke<Settings>("get_settings"),
  updateSettings: (settings: Settings) => invoke<Settings>("update_settings", { settings }),
  openTerminal: (cwd: string, sessionId?: string) => invoke("open_terminal", { cwd, sessionId }),
  resolvePermission: (id: number, allow: boolean) => invoke<boolean>("resolve_permission", { id, allow }),
  hooksInstalled: () => invoke<boolean>("hooks_installed"),
  installHooks: () => invoke("install_hooks"),
  uninstallHooks: () => invoke("uninstall_hooks"),
  startTask: (prompt: string, cwd?: string, vault?: VaultTask) =>
    invoke<number>("start_task", { task: { prompt, cwd: cwd ?? null, vault: vault ?? null } }),
  cancelTask: (id: number) => invoke<boolean>("cancel_task", { id }),
  detectVaults: () => invoke<string[]>("detect_vaults"),
  scanVault: () => invoke<VaultTask[]>("scan_vault"),
  vaultAddTask: (text: string) => invoke("vault_add_task", { text }),
  focusSession: (cwd: string) => invoke<boolean>("focus_session", { cwd }),
  installTheme: (url: string) => invoke<CustomTheme>("install_theme", { url }),
  importPet: (folder: string) => invoke<PetInfo>("import_pet", { folder }),
  listPets: () => invoke<PetInfo[]>("list_pets"),
  readPet: (id: string) => invoke<string>("read_pet", { id }),
  hooksSnippet: () => invoke<string>("hooks_snippet"),
  customThemes: () => invoke<CustomTheme[]>("list_custom_themes"),
  remoteInfo: () => invoke<string | null>("remote_info"),
  openInObsidian: (file: string) => invoke("open_in_obsidian", { file }),
};

export function on<T>(event: string, handler: (payload: T) => void) {
  return listen<T>(event, (e) => handler(e.payload));
}

export function errorText(err: unknown): string {
  return typeof err === "string" ? err : err instanceof Error ? err.message : JSON.stringify(err);
}
