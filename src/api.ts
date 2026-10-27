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
  /** 0 = sleepy, 100 = hyperactive. */
  activity: number;
  /** Obsidian palette commands shown as buttons (run through Obsidian's CLI). */
  obsidianFavorites: ObsidianFavorite[];
  /** The vault as memory: recall in tasks and session notes under "Claude NPC/". */
  brainEnabled: boolean;
  /** Also add memory to Claude Code prompts through the hook reply. */
  brainInjectSessions: boolean;
  brainExclude: string[];
  /** When a session ends, a small Haiku agent reflects on it and writes lessons and to-dos. */
  brainReflect: boolean;
  /** Reflections also note how the user likes to work; that personality is added to prompts. */
  brainPersona: boolean;
}

/** What one reflection wrote under "Claude NPC/". */
export interface ReflectOutcome {
  note: string | null;
  lessons: number;
  decisions: number;
  todos: number;
  /** Personality observations recorded. */
  persona: number;
  /** Observations that became part of the personality this time. */
  promoted: number;
}

/** An answer from "Pregúntale al cerebro", with the notes it cites. */
export interface BrainAnswer {
  text: string;
  sources: Array<{ title: string; path: string }>;
}

/** What a weekly review wrote. */
export interface WeeklyOutcome {
  note: string;
  reflections: number;
}

/** Something to look at in the vault; the NPC never changes anything for these. */
export interface MaintenanceNotice {
  kind: "stuck" | "duplicate" | "orphan";
  title: string;
  path: string;
  /** `stuck`: days the to-do has been open. */
  days: number | null;
  /** `duplicate`: the note it looks like. */
  related: string | null;
}

/** The personality note (`Claude NPC/Personalidad.md`) as the UI shows it. */
export interface PersonaView {
  traits: string[];
  about: string[];
  pending: number;
}

export interface BrainHit {
  path: string;
  title: string;
  excerpt: string;
  matched: string[];
  via: string | null;
  score: number;
}

/** A change to one of the user's notes, applied only when they press *Aplicar*. */
export interface BrainProposal {
  kind: "link" | "tag";
  path: string;
  title: string;
  target: string;
  line: number;
  before: string;
  after: string;
}

export interface BrainNote {
  path: string;
  title: string;
  kind: "session" | "memory" | "reflection" | "project" | "diary";
  mtimeS: number;
}

export interface BrainStatus {
  enabled: boolean;
  injectSessions: boolean;
  hasVault: boolean;
  notes: number;
  links: number;
  tags: number;
  builtMs: number;
  recent: BrainNote[];
}

export interface ObsidianFavorite {
  id: string;
  label: string;
}

export interface ObsidianCommand {
  id: string;
  name: string;
}

export type ObsidianAction = "daily" | "search" | "new" | "choose-vault";

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
  topic: string | null;
  prompt: string | null;
  subagents: number;
  agent: string;
  updatedMs: number;
}

/** A past session found in the CLI's transcript history (not necessarily running). */
export interface RecentSession {
  id: string;
  cwd: string;
  title: string | null;
  updatedMs: number;
}

/** One question of Claude's `AskUserQuestion` tool. */
export interface Question {
  question: string;
  header?: string;
  multiSelect?: boolean;
  options: Array<{ label: string; description?: string }>;
}

/** One hook event the NPC received (names only), for the diagnostics list. */
export interface HookLogEntry {
  ms: number;
  event: string;
  session: string;
  tool: string | null;
  note: string | null;
}

export interface PermissionRequest {
  id: number;
  sessionId: string;
  cwd: string | null;
  tool: string;
  detail: string;
  /** Set when the request is a question with options to pick from. */
  questions?: Question[] | null;
  /** Set when the request is Claude asking to leave plan mode with this plan. */
  plan?: string | null;
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
  kind: "start" | "text" | "tool" | "session" | "result";
  sessionId?: string;
  /** On `start`: the session the task continues, if any. */
  resume?: string | null;
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
  /** Answers a question request; `answers` maps each question's text to the chosen label(s). */
  answerQuestion: (id: number, answers: Record<string, string>) => invoke<boolean>("answer_question", { id, answers }),
  hooksInstalled: () => invoke<boolean>("hooks_installed"),
  installHooks: () => invoke("install_hooks"),
  uninstallHooks: () => invoke("uninstall_hooks"),
  startTask: (prompt: string, cwd?: string, vault?: VaultTask, resume?: string) =>
    invoke<number>("start_task", { task: { prompt, cwd: cwd ?? null, vault: vault ?? null, resume: resume ?? null } }),
  cancelTask: (id: number) => invoke<boolean>("cancel_task", { id }),
  authStatus: () => invoke<boolean>("auth_status"),
  authLogin: () => invoke("auth_login"),
  hookLog: () => invoke<HookLogEntry[]>("hook_log"),
  recentSessions: () => invoke<RecentSession[]>("recent_sessions"),
  detectVaults: () => invoke<string[]>("detect_vaults"),
  scanVault: () => invoke<VaultTask[]>("scan_vault"),
  vaultAddTask: (text: string) => invoke("vault_add_task", { text }),
  obsidianUri: (action: ObsidianAction, text?: string) => invoke("obsidian_uri", { action, text }),
  obsidianCommands: () => invoke<ObsidianCommand[]>("obsidian_commands"),
  brainStatus: (refresh = false) => invoke<BrainStatus>("brain_status", { refresh }),
  brainSearch: (query: string) => invoke<BrainHit[]>("brain_search", { query }),
  brainRemember: (text: string) => invoke<string>("brain_remember", { text }),
  brainReflect: (session?: string) => invoke<ReflectOutcome>("brain_reflect", { session: session ?? null }),
  brainPersona: () => invoke<PersonaView>("brain_persona"),
  brainAsk: (question: string) => invoke<BrainAnswer>("brain_ask", { question }),
  brainWeekly: (force = true) => invoke<WeeklyOutcome>("brain_weekly", { force }),
  brainMaintenance: () => invoke<MaintenanceNotice[]>("brain_maintenance"),
  brainPanel: () => invoke<string>("brain_panel"),
  brainSuggestions: () => invoke<BrainProposal[]>("brain_suggestions"),
  brainApply: (proposal: BrainProposal) => invoke("brain_apply", { proposal }),
  obsidianRunCommand: (id: string) => invoke("obsidian_run_command", { id }),
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
