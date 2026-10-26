import { api, on, type AgentEvent, type PermissionRequest, type Session, type TaskUpdate, type Usage, type VaultTask } from "./api";
import { describeActivity } from "./activity";
import { Npc, type Mood } from "./npc";
import { PetSheet } from "./petsprite";
import { resolveLang, setLang, t } from "./i18n";
import { registerThemes, setTheme } from "./sprite";
import { h, Ui, type Store } from "./ui";

const SCALE = 3;
const DONE_MS = 5000;
const ERROR_MS = 3500;

const store: Store = {
  settings: {
    vaultPath: "", workDir: "", allowEdits: false, autoApprove: false, port: 47650, theme: "postie", mini: false,
    telegramToken: "", telegramChatId: "", remoteView: false, remoteToken: "", slackWebhook: "", feishuWebhook: "", language: "auto",
    activity: 50,
  },
  pets: [],
  usage: null,
  sessions: [],
  tasks: [],
  vaultTasks: [],
  perms: [],
  hooksInstalled: false,
};

let ui: Ui;
let clickTimer = 0;
// One click opens the menu; a double click docks the character at the screen edge (or brings it back).
const npc = new Npc(
  SCALE,
  () => {
    if (clickTimer) {
      window.clearTimeout(clickTimer);
      clickTimer = 0;
      const mini = !npc.isMini;
      npc.setMini(mini);
      void ui.save({ mini });
      return;
    }
    clickTimer = window.setTimeout(() => {
      clickTimer = 0;
      ui.poke();
    }, 260);
  },
  () => void ui.save({ mini: false }),
  (text) => {
    const line = t(text);
    ui.showBubble(line, Math.max(2200, line.length * 90));
  },
);
ui = new Ui(store, npc, (text, ms) => ui.showBubble(text, ms));

let appliedTheme = "";
let themeRequest = 0;

/** Applies the saved look: language, built-in or custom palette, or an imported Codex pet. */
function applySettings(): Promise<void> {
  const lang = resolveLang(store.settings.language, navigator.languages);
  setLang(lang);
  document.documentElement.lang = lang;
  npc.setMini(store.settings.mini);
  npc.setActivity(store.settings.activity);

  const theme = store.settings.theme;
  if (theme === appliedTheme) return Promise.resolve();
  appliedTheme = theme;
  const request = ++themeRequest;
  if (theme.startsWith("pet:")) {
    return api
      .readPet(theme.slice(4))
      .then(PetSheet.load)
      .then((sheet) => { if (request === themeRequest) npc.setPet(sheet); })
      .catch(() => {
        // A pet that cannot be loaded falls back to the built-in character.
        if (request === themeRequest) {
          npc.setPet(null);
          setTheme("postie");
          npc.redraw();
        }
      });
  } else {
    npc.setPet(null);
    setTheme(theme);
    npc.redraw();
    return Promise.resolve();
  }
}
ui.onSettingsChanged = () => void applySettings();

async function loadThemes() {
  registerThemes(await api.customThemes().catch(() => []));
  store.pets = await api.listPets().catch(() => []);
}
ui.onThemesChanged = loadThemes;

// Hidden until the saved look is applied, so the default character never flashes at startup.
npc.el.style.visibility = "hidden";
const stage = h("div", { id: "stage" }, npc.el, ui.root, ui.bubble);
document.body.append(stage);

// ---- mood: what the character is doing, derived from Claude's activity ----------

let doneUntil = 0;
let errorUntil = 0;

function computeMood(): Mood {
  const now = performance.now();
  if (store.perms.length > 0) return "waiting";
  if (store.sessions.some((s) => s.state === "attention")) return "waiting";
  if (now < errorUntil) return "error";
  const working = store.sessions.some((s) => s.state === "working") || store.tasks.some((t) => t.status === "running" && t.usingTool);
  if (working) {
    const subagents = store.sessions.reduce((n, s) => n + s.subagents, 0);
    return subagents > 0 ? "juggling" : "working";
  }
  if (store.sessions.some((s) => s.state === "thinking") || store.tasks.some((t) => t.status === "running")) return "thinking";
  if (now < doneUntil) return "done";
  return "idle";
}

function updateMood() {
  npc.setMood(computeMood());
}

const folder = (path: string | null | undefined) => (path ?? "").split(/[\\/]/).filter(Boolean).pop() ?? "";

// ---- events from the backend ---------------------------------------------------------

void on<Session[]>("sessions", (sessions) => {
  store.sessions = sessions;
  ui.refresh();
  updateMood();
});

void on<AgentEvent>("agent-event", (event) => {
  switch (event.event) {
    case "PreToolUse":
      npc.pulse();
      ui.showBubble(describeActivity(event.tool, event.detail), 2500);
      break;
    case "PostToolUseFailure":
      errorUntil = performance.now() + ERROR_MS;
      ui.showBubble(t("Uy, algo falló…"), 3000);
      break;
    case "Stop":
      doneUntil = performance.now() + DONE_MS;
      ui.showBubble(event.message ? `✔ ${event.message.split("\n")[0].slice(0, 110)}` : t("✔ ¡Listo!"), 5000);
      break;
    case "Notification":
      ui.showBubble(t("Claude te necesita ✋"), 5000);
      break;
  }
  updateMood();
});

void on<PermissionRequest>("permission-request", (perm) => {
  store.perms.push(perm);
  ui.showBubble(t("¿Puedo usar {tool}?", { tool: perm.tool }), 0);
  ui.refresh();
  updateMood();
});

void on<number>("permission-done", (id) => {
  store.perms = store.perms.filter((p) => p.id !== id);
  if (store.perms.length === 0) ui.hideBubble();
  ui.refresh();
  updateMood();
});

void on<TaskUpdate>("task-update", (update) => {
  ui.applyTaskUpdate(update);
  if (update.kind === "result") {
    if (update.text === "Cancelled") ui.showBubble(t("Tarea cancelada"), 3000);
    else if (update.ok) {
      doneUntil = performance.now() + DONE_MS;
      ui.showBubble(update.vault ? t("✔ Anotado en tu nota de Obsidian") : t("✔ Tarea terminada. Pulsa para verla."), 6000);
    } else {
      errorUntil = performance.now() + ERROR_MS;
      ui.showBubble(t("La tarea falló"), 5000);
    }
  }
  updateMood();
});

let announcedVaultTasks = -1;
void on<VaultTask[]>("vault-tasks", (tasks) => {
  store.vaultTasks = tasks;
  if (announcedVaultTasks >= 0 && tasks.length > announcedVaultTasks) {
    ui.showBubble(t("📓 {n} tarea(s) #claude en tu vault", { n: tasks.length }), 5000);
  }
  announcedVaultTasks = tasks.length;
  ui.refresh();
});

void on<Usage>("usage", (usage) => {
  store.usage = usage;
  ui.refresh();
});

void on<string>("server-error", (message) => {
  ui.showBubble(t("No pude abrir el puerto de hooks: {msg}", { msg: message }), 8000);
});

// ---- hit regions: only the character and its panels catch the mouse -----------------

let lastHits = "";
let lastHitReport = 0;
function reportHits() {
  const now = performance.now();
  if (now - lastHitReport < 40) return; // the character moves every frame; ~25 updates/s is plenty
  lastHitReport = now;
  const rects = [...document.querySelectorAll<HTMLElement>("[data-hit]")]
    .filter((el) => (el.offsetParent !== null || el === npc.el) && getComputedStyle(el).pointerEvents !== "none")
    .map((el) => el.getBoundingClientRect())
    .filter((r) => r.width > 0 && r.height > 0)
    .map((r) => ({ x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }));
  const key = JSON.stringify(rects);
  if (key === lastHits) return;
  lastHits = key;
  void api.setHitRegions(rects);
}

// ---- main loop ---------------------------------------------------------------------------

let last = performance.now();
function frame(time: number) {
  const dt = Math.min(0.1, (time - last) / 1000);
  last = time;
  npc.update(dt);
  ui.layout();
  updateMood();
  reportHits();
  requestAnimationFrame(frame);
}

window.addEventListener("pointermove", (event) => npc.watch(event.clientX, event.clientY));
// The overlay ignores the mouse, so the backend reports where it is (window coordinates).
void on<[number, number]>("cursor", ([x, y]) => npc.watch(x, y));

async function boot() {
  try {
    const [, settings] = await Promise.all([loadThemes(), api.getSettings()]);
    store.settings = settings;
    await applySettings();
  } finally {
    npc.el.style.visibility = "";
  }
  ui.relocalize();
  store.hooksInstalled = await api.hooksInstalled().catch(() => false);
  store.vaultTasks = await api.scanVault().catch(() => []);
  announcedVaultTasks = store.vaultTasks.length;
  ui.refresh();
  ui.showBubble(store.hooksInstalled ? `${folder(store.settings.vaultPath) ? "📓 " : ""}${t("¡Hola! Estoy atento.")}` : t("¡Hola! Pásame el ratón por encima 👋"), 5000);
}

void boot();
requestAnimationFrame(frame);
