import {
  api, errorText,
  type PermissionRequest, type PetInfo, type Quota, type RecentSession, type Session, type Settings, type TaskUpdate, type Usage, type VaultTask,
} from "./api";
import { describeActivity } from "./activity";
import { firstLine, renderMarkdown } from "./markdown";
import type { Children } from "./children";
import { LANGS, t, type Lang } from "./i18n";
import { HATS, HUES, renderPose, swatchColor, THEMES, type HatId } from "./sprite";
import type { Bounds, Npc } from "./npc";

type Child = Node | string | null | false | undefined;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, unknown> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "class") el.className = String(value);
    else if (key.startsWith("on")) el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    else if (key === "value" || key === "checked") (el as unknown as Record<string, unknown>)[key] = value;
    else el.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of children) if (child !== null && child !== undefined && child !== false) el.append(child);
  return el;
}

export interface TaskView {
  id: number;
  prompt: string;
  status: "running" | "ok" | "error" | "cancelled";
  line: string;
  result?: string;
  note?: string | null;
  vault?: VaultTask | null;
  noteOpen: boolean;
  /** Claude session this task ran in, once known; lets the user continue it. */
  sessionId?: string;
  cwd?: string;
  /** Session this task continued, so a retry goes back to it instead of the (possibly empty) session of the failed run. */
  resumeOf?: string;
  /** True while the latest event was a tool call (drives the NPC's "working" mood). */
  usingTool?: boolean;
}

/** The session the next task will continue (`claude --resume`). */
interface Target {
  sessionId: string;
  cwd: string;
}

export interface Store {
  settings: Settings;
  sessions: Session[];
  tasks: TaskView[];
  vaultTasks: VaultTask[];
  perms: PermissionRequest[];
  hooksInstalled: boolean;
  usage: Usage | null;
  pets: PetInfo[];
  /** The small copies spawned for sessions. */
  children: Children;
}

type TabId = "tasks" | "sessions" | "vault" | "settings";
type SettingsSection = "look" | "activity" | "claude" | "links";

interface TabBody {
  el: HTMLElement;
  refresh?: () => void;
}

function stateLabel(state: string): string {
  switch (state) {
    case "idle": return t("en reposo");
    case "thinking": return t("pensando…");
    case "working": return t("trabajando");
    case "waiting": return t("esperando permiso");
    case "attention": return t("te necesita");
    case "done": return t("terminó");
    case "error": return t("tuvo un error");
    default: return state;
  }
}

/** States in which a headless `--resume` would collide with a turn that is still running. */
const BUSY = new Set(["thinking", "working", "waiting"]);

const STATE_COLOR: Record<string, string> = {
  idle: "#9aa3ad", thinking: "#e3b341", working: "#4caf7d", waiting: "#e8643c",
  attention: "#e8643c", done: "#4c8fe0", error: "#d63a3a",
};

/** The CLI's own wording when its login is missing or expired. */
const isAuthError = (text: string | undefined) =>
  /failed to authenticate|oauth|not logged in|please run \/login|invalid api key/i.test(text ?? "");

const baseName =(path: string) => path.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || path;
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

function ago(ms: number): string {
  const minutes = Math.max(0, Math.round((Date.now() - ms) / 60_000));
  if (minutes < 1) return t("ahora");
  if (minutes < 60) return t("hace {n} min", { n: minutes });
  if (minutes < 1440) return t("hace {n} h", { n: Math.round(minutes / 60) });
  return t("hace {n} d", { n: Math.round(minutes / 1440) });
}

const SVG = "http://www.w3.org/2000/svg";

function untilReset(resetsAt: number | null): string {
  if (!resetsAt) return "";
  const minutes = Math.max(0, Math.round((resetsAt * 1000 - Date.now()) / 60000));
  return minutes >= 60
    ? t("reinicia en {h} h {m} min", { h: Math.floor(minutes / 60), m: minutes % 60 })
    : t("reinicia en {m} min", { m: minutes });
}

/** A small progress ring with the percentage in the middle. */
function ring(label: string, quota: Quota | null): HTMLElement {
  const pct = quota ? Math.min(100, Math.max(0, Math.round(quota.usedPct))) : null;
  const radius = 17;
  const circumference = 2 * Math.PI * radius;
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 0 44 44");
  svg.setAttribute("width", "44");
  svg.setAttribute("height", "44");
  const circle = (stroke: string, dash?: number) => {
    const c = document.createElementNS(SVG, "circle");
    c.setAttribute("cx", "22");
    c.setAttribute("cy", "22");
    c.setAttribute("r", String(radius));
    c.setAttribute("fill", "none");
    c.setAttribute("stroke", stroke);
    c.setAttribute("stroke-width", "5");
    if (dash !== undefined) {
      c.setAttribute("stroke-dasharray", `${(circumference * dash) / 100} ${circumference}`);
      c.setAttribute("stroke-linecap", "round");
      c.setAttribute("transform", "rotate(-90 22 22)");
    }
    return c;
  };
  svg.append(circle("#e6d7bd"));
  if (pct !== null) svg.append(circle(pct >= 90 ? "#d63a3a" : pct >= 70 ? "#e8a23c" : "#4caf7d", pct));
  const value = document.createElementNS(SVG, "text");
  value.setAttribute("x", "22");
  value.setAttribute("y", "26");
  value.setAttribute("text-anchor", "middle");
  value.setAttribute("font-size", "11");
  value.setAttribute("font-weight", "700");
  value.setAttribute("fill", "#3a2820");
  value.textContent = pct === null ? "–" : `${pct}`;
  svg.append(value);
  return h("div", { class: "ring", title: quota ? untilReset(quota.resetsAt) || label : label }, svg, h("div", { class: "muted small" }, label));
}

export class Ui {
  readonly root = h("div", { class: "stack" });
  readonly bubble = h("div", { class: "bubble" });
  private readonly notesEl = h("div", { class: "notes" });
  private readonly panelEl = h("div", { class: "panel", "data-hit": "" });
  private readonly permsEl = h("div", { class: "perms" });
  private readonly fanEl = h("div", { class: "fan", "data-hit": "" });
  private tab: TabId | null = null;
  private body: TabBody | null = null;
  private hover = false;
  private closeTimer = 0;
  private bubbleTimer = 0;
  private fanButtons = new Map<TabId, HTMLButtonElement>();
  private target: Target | null = null;
  /** Session whose detail popup is open (by id). */
  private openSession: string | null = null;
  /** Session whose child is being customized in the sessions list. */
  private customizing: string | null = null;
  private settingsSection: SettingsSection = "look";
  private sessionCardCache: { key: string; sessionId: string; el: HTMLElement } | null = null;
  /** Scroll to apply once a freshly built session popup is in the page (null `keep` = jump to the latest text). */
  private pendingScroll: { body: HTMLElement | null; keep: number | null } | null = null;
  private recent: RecentSession[] = [];
  private recentAt = 0;
  /** Whether the `claude` CLI that runs tasks is signed in; null until checked. */
  private cliAuth: boolean | null = null;
  private authPoll = 0;
  onSettingsChanged: () => void = () => {};
  /** Reloads the custom themes and imported pets after one is added. */
  onThemesChanged: () => Promise<void> = async () => {};

  constructor(private readonly store: Store, private readonly npc: Npc, private readonly say: (t: string, ms?: number) => void) {
    this.panelEl.style.display = "none";
    this.root.append(this.notesEl, this.panelEl, this.permsEl, this.fanEl);

    for (const [id, icon] of [["tasks", "📝"], ["sessions", "🖥️"], ["vault", "📓"], ["settings", "⚙️"]] as Array<[TabId, string]>) {
      const button = h("button", { class: "fan-btn", onclick: () => this.toggle(id) }, icon, h("span", { class: "badge" }));
      this.fanButtons.set(id, button);
      this.fanEl.append(button);
    }
    this.titleButtons();

    for (const el of [this.npc.el, this.fanEl, this.panelEl]) {
      el.addEventListener("pointerenter", () => this.setHover(true));
      el.addEventListener("pointerleave", () => this.setHover(false));
    }
    this.panelEl.addEventListener("pointerdown", () => void api.focusWindow());
    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") this.close();
    });
    this.refresh();
  }

  private titleButtons() {
    const titles: Record<TabId, string> = {
      tasks: t("Tareas"), sessions: t("Sesiones de Claude Code"), vault: t("Obsidian"), settings: t("Ajustes"),
    };
    for (const [id, button] of this.fanButtons) button.title = titles[id];
  }

  /** Rebuilds the visible texts after the language changes. */
  relocalize() {
    this.titleButtons();
    if (this.tab) {
      const open = this.tab;
      this.tab = null;
      this.toggle(open);
    } else {
      this.refresh();
    }
  }

  // ---- menu and panels ------------------------------------------------------

  private setHover(over: boolean) {
    this.hover = over;
    window.clearTimeout(this.closeTimer);
    if (over) this.fanEl.classList.add("open");
    else if (!this.tab) this.closeTimer = window.setTimeout(() => this.fanEl.classList.remove("open"), 450);
    this.npc.engaged = over || this.tab !== null;
  }

  /** Menu button on the character itself: opens or closes the last tab. */
  poke() {
    if (this.tab) this.close();
    else this.toggle("tasks");
  }

  toggle(id: TabId) {
    if (this.tab === id) return this.close();
    this.tab = id;
    this.body = this.build(id);
    this.panelEl.replaceChildren(
      h("button", { class: "x", title: t("Cerrar (Esc)"), onclick: () => this.close() }, "×"),
      this.body.el,
    );
    this.panelEl.style.display = "block";
    this.fanEl.classList.add("open");
    this.npc.engaged = true;
    this.refresh();
  }

  close() {
    this.tab = null;
    this.body = null;
    this.panelEl.style.display = "none";
    this.npc.engaged = this.hover;
    if (!this.hover) this.fanEl.classList.remove("open");
    this.refresh();
  }

  private build(id: TabId): TabBody {
    switch (id) {
      case "tasks": return this.tasksTab();
      case "sessions": return this.sessionsTab();
      case "vault": return this.vaultTab();
      case "settings":
        void this.checkAuth();
        return this.settingsTab();
    }
  }

  refresh() {
    this.body?.refresh?.();
    this.renderPerms();
    this.renderNotes();
    const running = this.store.tasks.filter((t) => t.status === "running").length;
    this.badge("tasks", running);
    this.badge("sessions", this.store.sessions.length);
    this.badge("vault", this.store.vaultTasks.length);
    for (const [id, button] of this.fanButtons) button.classList.toggle("active", this.tab === id);
  }

  private badge(id: TabId, count: number) {
    const badge = this.fanButtons.get(id)?.querySelector(".badge");
    if (badge) {
      badge.textContent = count > 0 ? String(count) : "";
      (badge as HTMLElement).style.display = count > 0 ? "block" : "none";
    }
  }

  /** Places the stack above the character and the speech bubble beside it. */
  layout() {
    const b = this.npc.bounds();
    const width = 340;
    const left = Math.min(Math.max(8, b.x + b.w / 2 - width / 2), window.innerWidth - width - 8);
    this.root.style.left = `${left}px`;
    this.root.style.bottom = `${window.innerHeight - b.top + 14}px`;
    this.root.style.width = `${width}px`;

    const child = this.speaker ? this.childBounds(this.speaker) : null;
    this.bubble.style.top = "auto";
    if (child) {
      // A child speaks: the bubble sits above it with its tail pointing down at it.
      const w = this.bubble.offsetWidth;
      const left = Math.min(Math.max(8, child.x + child.w / 2 - w / 2), Math.max(8, window.innerWidth - w - 8));
      const tail = Math.min(Math.max(16, child.x + child.w / 2 - left), Math.max(16, w - 16));
      this.bubble.style.left = `${left}px`;
      this.bubble.style.right = "auto";
      this.bubble.style.bottom = `${Math.max(8, window.innerHeight - child.top + 12)}px`;
      this.bubble.style.setProperty("--tail", `${tail}px`);
      this.setTail("from-below");
      return;
    }
    const onRight = b.x + b.w + 250 < window.innerWidth;
    this.bubble.style.left = onRight ? `${b.x + b.w + 6}px` : "auto";
    this.bubble.style.right = onRight ? "auto" : `${window.innerWidth - b.x + 6}px`;
    // Anchored by its bottom edge so a multi-line bubble grows upward instead of off the screen.
    this.bubble.style.bottom = `${Math.max(8, window.innerHeight - (b.top + b.h * 0.6))}px`;
    this.setTail(onRight ? "from-left" : "from-right");
  }

  private setTail(kind: "from-below" | "from-left" | "from-right") {
    for (const k of ["from-below", "from-left", "from-right"]) this.bubble.classList.toggle(k, k === kind);
  }

  /** Where a child's bounds are, so its bubble can point at it; set by the wiring in main.ts. */
  childBounds: (sessionId: string) => Bounds | null = () => null;
  /** Session whose child is speaking; null when the main character is. */
  private speaker: string | null = null;

  showBubble(text: string, ms = 4000, speaker: string | null = null) {
    window.clearTimeout(this.bubbleTimer);
    this.speaker = speaker;
    this.bubble.textContent = text;
    this.bubble.classList.add("show");
    if (ms > 0) this.bubbleTimer = window.setTimeout(() => this.bubble.classList.remove("show"), ms);
  }

  hideBubble() {
    window.clearTimeout(this.bubbleTimer);
    this.bubble.classList.remove("show");
  }

  // ---- permission cards and result notes -------------------------------------

  /** Picks made on question cards, kept across re-renders: request id -> question index -> labels / typed text. */
  private drafts = new Map<number, { picks: Map<number, Set<string>>; other: Map<number, string> }>();
  /** Bumped when a pick changes, so cached cards know to rebuild. */
  private draftVersion = 0;
  private permsKey = "";
  /** Text typed in the session popup's write box, kept while the popup rebuilds. */
  private sessionDraft = "";

  private draft(id: number) {
    let d = this.drafts.get(id);
    if (!d) this.drafts.set(id, (d = { picks: new Map(), other: new Map() }));
    return d;
  }

  private renderPerms() {
    // Requests of the session whose popup is open are shown inside it.
    const shown = this.store.perms.filter((p) => p.sessionId !== this.openSession);
    const key = `${shown.map((p) => p.id).join(",")}|${this.draftVersion}|${this.openSession}`;
    if (key === this.permsKey) return; // unchanged: keep the nodes so typing and focus survive hook events
    this.permsKey = key;
    this.permsEl.replaceChildren(...shown.map((perm) => this.permCard(perm)));
  }

  /** One pending request: a tool permission, a plan to approve, or a question with options. */
  private permCard(perm: PermissionRequest, inline = false): HTMLElement {
    const asking = !!perm.questions?.length;
    const allow = perm.plan ? t("Aprobar plan") : t("Permitir");
    const deny = perm.plan ? t("Rechazar") : t("Denegar");
    return h("div", inline ? { class: "perm inline" } : { class: "card perm", "data-hit": "" },
      h("div", { class: "perm-head" }, `${asking ? "❓" : "🔐"} ${asking ? t("Claude pregunta") : perm.tool}`, h("span", { class: "muted" }, perm.cwd ? ` · ${baseName(perm.cwd)}` : "")),
      ...(asking ? this.questionBody(perm) : [
        perm.plan ? h("div", { class: "sticky-body rich plan" }, renderMarkdown(perm.plan)) : perm.detail && h("code", { class: "perm-detail" }, perm.detail),
        h("div", { class: "row" },
          h("button", { class: "btn ok", onclick: () => this.answer(perm.id, true) }, `${allow} `, h("kbd", {}, "Ctrl+Alt+Y")),
          h("button", { class: "btn no", onclick: () => this.answer(perm.id, false) }, `${deny} `, h("kbd", {}, "Ctrl+Alt+N"))),
      ]));
  }

  /** The options of each question plus a free-text "other"; the answers go back to Claude in the hook reply. */
  private questionBody(perm: PermissionRequest): HTMLElement[] {
    const draft = this.draft(perm.id);
    const questions = perm.questions ?? [];
    const answerFor = (i: number) => (draft.other.get(i) ?? "").trim() || [...(draft.picks.get(i) ?? [])].join(", ");
    const send = h("button", { class: "btn ok", onclick: () => {
      const answers = Object.fromEntries(questions.map((q, i) => [q.question, answerFor(i)]));
      void api.answerQuestion(perm.id, answers).catch((err) => this.say(errorText(err), 6000));
      this.drafts.delete(perm.id);
      this.store.perms = this.store.perms.filter((p) => p.id !== perm.id);
      this.refresh();
    } }, t("Enviar respuestas"));
    const sync = () => { send.disabled = !questions.every((_, i) => answerFor(i) !== ""); };
    sync();
    return [
      ...questions.map((q, i) => {
        const picked = draft.picks.get(i) ?? new Set<string>();
        const other = h("input", { class: "field small", placeholder: t("Otra respuesta…"), value: draft.other.get(i) ?? "" });
        other.addEventListener("input", () => { draft.other.set(i, other.value); sync(); });
        return h("div", { class: "question" },
          h("div", { class: "q-text" }, q.header ? `${q.header}: ${q.question}` : q.question),
          h("div", { class: "q-options" }, ...q.options.map((o) =>
            h("button", {
              class: `q-opt${picked.has(o.label) ? " on" : ""}`,
              title: o.description ?? "",
              onclick: () => {
                const next = new Set(q.multiSelect ? picked : []);
                if (picked.has(o.label)) next.delete(o.label); else next.add(o.label);
                draft.picks.set(i, next);
                draft.other.delete(i);
                this.draftVersion++;
                this.refresh();
              },
            }, o.label))),
          other);
      }),
      h("div", { class: "row" }, send,
        h("button", { class: "btn no", onclick: () => this.answer(perm.id, false) }, t("Rechazar"))),
    ];
  }

  private answer(id: number, allow: boolean) {
    void api.resolvePermission(id, allow);
    this.drafts.delete(id);
    this.store.perms = this.store.perms.filter((p) => p.id !== id);
    this.refresh();
  }

  private async sendToSession(s: Session, text: string) {
    try {
      await api.startTask(text, s.cwd, undefined, s.id);
      this.say(t("Enviado a {name}", { name: baseName(s.cwd) }), 3500);
    } catch (err) {
      this.say(errorText(err), 7000);
    }
  }

  /** Popup with everything known about one session: topic, last prompt and Claude's last reply. */
  private sessionCard(s: Session): HTMLElement {
    const close = () => { this.openSession = null; this.refresh(); };
    const pending = this.store.perms.filter((p) => p.sessionId === s.id);
    const busy = BUSY.has(s.state);
    const canWrite = this.resumable(s) && !!s.cwd;
    const activity = s.tool ? describeActivity(s.tool, s.detail) : "";
    const box = h("textarea", { class: "field", rows: 2, placeholder: t("Escribirle a esta sesión… (Enter envía)") });
    box.value = this.sessionDraft;
    const submit = () => {
      const text = box.value.trim();
      if (!text) return;
      box.value = "";
      this.sessionDraft = "";
      void this.sendToSession(s, text);
    };
    box.addEventListener("input", () => { this.sessionDraft = box.value; });
    box.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        submit();
      }
    });
    return h("div", { class: "card sticky straight", "data-hit": "" },
      h("div", { class: "sticky-title" }, s.topic || baseName(s.cwd || t("sesión"))),
      h("div", { class: "muted small", title: s.cwd }, `${baseName(s.cwd || "")} · ${stateLabel(s.state)}${busy && activity ? ` · ${activity}` : ""}`),
      ...pending.map((perm) => this.permCard(perm, true)),
      s.prompt && s.prompt !== s.topic && h("div", { class: "muted small" }, `${t("Tú")}: ${s.prompt}`),
      h("div", { class: "sticky-body rich" }, s.message ? renderMarkdown(s.message) : activity || t("(sin texto)")),
      canWrite && (busy
        ? h("div", { class: "muted small" }, pending.length ? t("Respóndele arriba para que siga.") : t("Está trabajando; podrás escribirle cuando termine."))
        : box),
      h("div", { class: "row" },
        canWrite && !busy && h("button", { class: "btn ok", onclick: submit }, t("Enviar")),
        s.message && h("button", { class: "btn", onclick: () => void navigator.clipboard.writeText(s.message ?? "") }, t("Copiar")),
        s.cwd && h("button", { class: "btn", title: t("Traer la terminal al frente (o abrir una nueva)"), onclick: () => void this.jumpTo(s) }, t("Terminal")),
        h("button", { class: "btn", onclick: close }, t("Cerrar"))));
  }

  /** Hook events refresh the UI constantly; keep the same popup node (and its animation, typed text and selection) until its content changes. */
  private cachedSessionCard(s: Session): HTMLElement {
    const pending = this.store.perms.filter((p) => p.sessionId === s.id).map((p) => p.id).join(",");
    const key = [s.id, s.state, s.topic, s.prompt, s.message, s.tool, s.detail, pending, this.draftVersion].join("\u0001");
    if (this.sessionCardCache?.key !== key) {
      // Like a chat: open at the latest text, but if the user had scrolled up in this same session, stay where they were.
      const old = this.sessionCardCache?.sessionId === s.id ? this.sessionCardCache.el.querySelector<HTMLElement>(".sticky-body") : null;
      const keep = old && old.scrollHeight - old.scrollTop - old.clientHeight > 24 ? old.scrollTop : null;
      const el = this.sessionCard(s);
      this.pendingScroll = { body: el.querySelector<HTMLElement>(".sticky-body"), keep };
      this.sessionCardCache = { key, sessionId: s.id, el };
    }
    return this.sessionCardCache.el;
  }

  private renderNotes() {
    const open = this.store.tasks.filter((task) => task.noteOpen && task.result !== undefined);
    const session = this.store.sessions.find((s) => s.id === this.openSession);
    if (this.openSession && !session) this.openSession = null; // it ended
    if (!session) this.sessionCardCache = null; // reopening starts again at the latest text
    this.notesEl.replaceChildren(
      ...(session ? [this.cachedSessionCard(session)] : []),
      ...open.map((task) =>
        h("div", { class: `card sticky${task.status === "ok" ? "" : " bad"}`, "data-hit": "" },
          h("div", { class: "sticky-title" }, task.status === "ok" ? "✔ " : "✖ ", clip(task.prompt, 60)),
          h("div", { class: "sticky-body rich" }, task.status === "error" && isAuthError(task.result)
            ? (this.cliAuth ? t("Ya has iniciado sesión. Pulsa Reintentar para enviarla de nuevo.") : t("El CLI de Claude no tiene la sesión iniciada. Inicia sesión una vez y vuelve a enviar."))
            : task.result ? renderMarkdown(task.result) : t("(sin texto)")),
          task.note && h("div", { class: "muted small" }, task.note),
          h("div", { class: "row" },
            task.status === "error" && (isAuthError(task.result) && !this.cliAuth
              ? h("button", { class: "btn ok", onclick: () => void this.login() }, t("Iniciar sesión"))
              : h("button", { class: "btn ok", onclick: () => void this.retry(task) }, t("Reintentar"))),
            h("button", { class: "btn", onclick: () => void navigator.clipboard.writeText(task.result ?? "") }, t("Copiar")),
            task.vault && h("button", { class: "btn", onclick: () => void this.openNote(task.vault!.file) }, t("Abrir en Obsidian")),
            h("button", { class: "btn", onclick: () => { task.noteOpen = false; this.refresh(); } }, t("Cerrar"))))),
    );
    const pending = this.pendingScroll;
    this.pendingScroll = null;
    if (pending?.body) pending.body.scrollTop = pending.keep ?? pending.body.scrollHeight;
  }

  /** Brings the session's terminal forward; if its window cannot be found, opens a new one that resumes it. */
  /** Reads the transcript history at most every 15 s while the Sessions tab is open. */
  private async loadRecent() {
    if (Date.now() - this.recentAt < 15_000) return;
    this.recentAt = Date.now();
    this.recent = await api.recentSessions().catch(() => []);
    this.refresh();
  }

  /** Past sessions from the CLI history that are not already listed as active. */
  private recentRows(): HTMLElement[] {
    const rows = this.recent.filter((r) => !this.store.sessions.some((s) => s.id === r.id)).slice(0, 12);
    if (rows.length === 0) return [];
    return [
      h("div", { class: "muted small section-label" }, t("Recientes")),
      ...rows.map((r) =>
        h("div", { class: "item" },
          h("span", { class: "dot", style: "background:#9aa3ad" }),
          h("div", { class: "item-main", title: r.cwd },
            h("div", { class: "item-title clamp" }, r.title || baseName(r.cwd)),
            h("div", { class: "muted small" }, `${baseName(r.cwd)} · ${ago(r.updatedMs)}`)),
          h("div", { class: "item-actions" },
            h("button", { class: "btn ok", title: t("Escribirle desde aquí (continúa la conversación)"), onclick: () => this.writeTo({ sessionId: r.id, cwd: r.cwd }) }, t("Escribir")),
            h("button", { class: "btn", title: t("Traer la terminal al frente (o abrir una nueva)"), onclick: () => void this.jumpTo(r) }, t("Terminal"))))),
    ];
  }

  private async jumpTo(session: { id: string; cwd: string }) {
    try {
      if (await api.focusSession(session.cwd)) return;
      await api.openTerminal(session.cwd, session.id);
    } catch (err) {
      this.say(errorText(err), 6000);
    }
  }

  async checkAuth() {
    this.cliAuth = await api.authStatus().catch(() => null);
    this.refresh();
  }

  /** Opens `claude auth login` in a terminal and waits (up to 5 min) until the CLI reports it is signed in. */
  private async login() {
    try {
      await api.authLogin();
    } catch (err) {
      this.say(errorText(err), 7000);
      return;
    }
    this.say(t("Termina el inicio de sesión en la terminal que se abrió."), 8000);
    window.clearInterval(this.authPoll);
    const deadline = Date.now() + 5 * 60_000;
    this.authPoll = window.setInterval(() => {
      void api.authStatus().then((ok) => {
        if (ok) {
          window.clearInterval(this.authPoll);
          this.cliAuth = true;
          this.say(t("✔ Sesión iniciada. Ya puedes enviar tareas."), 6000);
          this.refresh();
        } else if (Date.now() > deadline) {
          window.clearInterval(this.authPoll);
        }
      }).catch(() => {});
    }, 3000);
  }

  private async openNote(file: string) {
    try { await api.openInObsidian(file); } catch (err) { this.say(errorText(err), 6000); }
  }

  // ---- tabs ---------------------------------------------------------------------

  private async send(prompt: string, vault?: VaultTask) {
    // Vault tasks always run in the vault, never inside a continued session.
    const target = vault ? null : this.target;
    try {
      await api.startTask(prompt, target?.cwd || this.store.settings.workDir || undefined, vault, target?.sessionId);
    } catch (err) {
      this.say(errorText(err), 7000);
    }
  }

  /** Sends a failed task again (same prompt, folder and session) and drops the failed entry. */
  private async retry(task: TaskView) {
    try {
      await api.startTask(task.prompt, task.cwd || this.store.settings.workDir || undefined, task.vault ?? undefined, task.resumeOf);
      this.store.tasks = this.store.tasks.filter((x) => x !== task);
      this.refresh();
    } catch (err) {
      this.say(errorText(err), 7000);
    }
  }

  /** Points the Tasks box at a session so the next message continues it. */
  private writeTo(target: Target) {
    this.target = target;
    this.tab = null;
    this.toggle("tasks");
    this.panelEl.querySelector("textarea")?.focus();
  }

  /** A follower was clicked: write to its session if it is free, otherwise show what it is up to. */
  pickSession(s: Session) {
    void api.focusWindow();
    this.openSession = s.id; // the popup shows its state, pending requests and a box to write to it
    this.refresh();
  }

  private resumable(s: Session): boolean {
    return (!s.agent || s.agent === "claude") && s.id !== "unknown" && !s.id.includes(":");
  }

  private tasksTab(): TabBody {
    const input = h("textarea", { class: "field", rows: 2, placeholder: t("Pídele algo a Claude… (Enter envía)") });
    const submit = () => {
      const text = input.value.trim();
      if (!text) return;
      input.value = "";
      void this.send(text);
    };
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        submit();
      }
    });
    const dir = h("input", { class: "field small", placeholder: t("Carpeta de trabajo (vacío = tu carpeta de usuario)"), value: this.store.settings.workDir });
    dir.addEventListener("change", () => void this.save({ workDir: dir.value.trim() }));
    const list = h("div", { class: "list" });
    const chip = h("div", { class: "row" });

    const refresh = () => {
      chip.replaceChildren(
        ...(this.target ? [
          h("span", { class: "muted small", title: this.target.cwd }, t("Continuando sesión de {name}", { name: baseName(this.target.cwd) || t("sesión") })),
          h("button", { class: "btn", title: t("Empezar una conversación nueva"), onclick: () => { this.target = null; this.refresh(); } }, "×"),
        ] : []),
      );
      list.replaceChildren(
        ...this.store.tasks.slice(0, 6).map((task) =>
          h("div", { class: "item" },
            h("div", { class: "item-main" },
              h("div", { class: "item-title" }, `${{ running: "⏳", ok: "✅", error: "❌", cancelled: "⏹️" }[task.status]} ${clip(task.prompt, 70)}`),
              h("div", { class: "muted small" }, clip(task.line, 90))),
            task.status === "running" && h("button", { class: "btn", onclick: () => void api.cancelTask(task.id) }, t("Parar")),
            task.status !== "running" && task.result !== undefined && !task.noteOpen && h("button", { class: "btn", onclick: () => { task.noteOpen = true; this.refresh(); } }, t("Ver")),
            task.status === "ok" && task.sessionId && !task.vault && h("button", { class: "btn", title: t("Seguir esta conversación"), onclick: () => this.writeTo({ sessionId: task.sessionId!, cwd: task.cwd ?? "" }) }, t("Continuar")),
            task.status === "error" && h("button", { class: "btn ok", title: t("Volver a enviar esta tarea"), onclick: () => void this.retry(task) }, t("Reintentar")))),
        ...(this.store.tasks.length === 0 ? [h("div", { class: "muted" }, t("Aún no hay tareas. Escribe una arriba."))] : []),
      );
    };
    const el = h("div", { class: "tab" },
      h("h3", {}, t("Tareas para Claude")), chip, input,
      h("div", { class: "row" }, h("button", { class: "btn ok", onclick: submit }, t("Enviar")), dir), list);
    return { el, refresh };
  }

  /** A thin ring in the child's colour around the status dot, to tell the sessions apart in the list. */
  private childRing(s: Session): string {
    const look = this.store.children.get(s.id);
    return look ? `;box-shadow:0 0 0 2px ${swatchColor(look.hue)}` : "";
  }

  private childButton(s: Session): HTMLElement {
    const children = this.store.children;
    if (children.has(s.id)) {
      return h("button", {
        class: `btn${this.customizing === s.id ? " ok" : ""}`,
        title: t("Personalizar hijo"),
        onclick: () => { this.customizing = this.customizing === s.id ? null : s.id; this.refresh(); },
      }, `🎨 ${t("Mi hijo")}`);
    }
    return h("button", {
      class: "btn",
      title: t("Crear una mini mascota que sigue a esta sesión"),
      onclick: () => { this.customizing = s.id; children.add(s.id); },
    }, t("Generar hijo"));
  }

  /** Colour and hat pickers for one child, plus a way to send it away. */
  private designPanel(s: Session): HTMLElement {
    const children = this.store.children;
    const look = children.get(s.id)!;
    const hatNames: Record<HatId, string> = {
      none: t("Sin gorro"), party: t("Fiesta"), crown: t("Corona"), tophat: t("Chistera"),
      beanie: t("Gorro de lana"), flower: t("Flor"), antenna: t("Antena"), halo: t("Aureola"),
    };
    const hatPreview = (hat: HatId) => {
      const canvas = document.createElement("canvas");
      canvas.width = 32;
      canvas.height = 28;
      canvas.getContext("2d")!.drawImage(renderPose("idle", 2, 0, { hue: look.hue, hat }), 0, 0);
      return canvas;
    };
    return h("div", { class: "item design" },
      h("div", { class: "muted small" }, t("Color")),
      h("div", { class: "swatches" }, ...HUES.map((hue) =>
        h("button", { class: `swatch${look.hue === hue ? " on" : ""}`, style: `background:${swatchColor(hue)}`, onclick: () => children.setLook(s.id, { hue }) }))),
      h("div", { class: "muted small" }, t("Gorro")),
      h("div", { class: "hats" }, ...HATS.map((hat) =>
        h("button", { class: `hat${look.hat === hat ? " on" : ""}`, title: hatNames[hat], onclick: () => children.setLook(s.id, { hat }) }, hatPreview(hat)))),
      h("div", { class: "row" },
        h("button", {
          class: "btn",
          title: t("Quitar la mini mascota de esta sesión"),
          onclick: () => { this.customizing = null; children.remove(s.id); },
        }, t("Quitar hijo"))));
  }

  private sessionsTab(): TabBody {
    const list = h("div", { class: "list" });
    const hooks = h("div", { class: "hooks" });
    const copyHooks = async () => {
      try {
        await navigator.clipboard.writeText(await api.hooksSnippet());
        this.say(t("Hooks copiados. Pégalos en ~/.claude/settings.json de la otra máquina (con un túnel SSH -R, o en WSL con red mirrored)."), 9000);
      } catch (err) {
        this.say(errorText(err), 6000);
      }
    };
    const refresh = () => {
      hooks.replaceChildren(
        ...(this.store.hooksInstalled ? [] : [
          h("div", { class: "muted small" }, t("Para ver tus sesiones de Claude Code y aprobar permisos desde aquí, conecta los hooks (se añaden a ~/.claude/settings.json con copia de seguridad).")),
          h("button", { class: "btn ok", onclick: () => void this.installHooks() }, t("Conectar con Claude Code")),
        ]),
        h("button", { class: "btn", onclick: () => void copyHooks() }, t("Copiar hooks para otra máquina o WSL")),
      );
      list.replaceChildren(
        ...this.store.sessions.flatMap((s) => [
          h("div", { class: "item" },
            h("span", { class: "dot", style: `background:${STATE_COLOR[s.state] ?? "#999"}${this.childRing(s)}` }),
            h("div", { class: "item-main clickable", title: t("Ver el detalle"), onclick: () => { this.openSession = this.openSession === s.id ? null : s.id; this.refresh(); } },
              h("div", { class: "item-title clamp", title: s.cwd }, s.topic || baseName(s.cwd || t("sesión"))),
              h("div", { class: "muted small" }, `${baseName(s.cwd || "")} · ${stateLabel(s.state)}${s.agent && s.agent !== "claude" ? ` · ${s.agent}` : ""}${s.subagents ? t(" · {n} subagentes", { n: s.subagents }) : ""}`),
              h("div", { class: "muted small clamp" }, (s.state === "done" ? firstLine(s.message ?? "") : s.tool ? describeActivity(s.tool, s.detail) : "") || "")),
            h("div", { class: "item-actions" },
              this.resumable(s) && s.cwd && h("button", {
                class: "btn ok",
                disabled: BUSY.has(s.state),
                title: BUSY.has(s.state) ? t("Claude está trabajando en esta sesión; espera a que termine") : t("Escribirle desde aquí (continúa la conversación)"),
                onclick: () => this.writeTo({ sessionId: s.id, cwd: s.cwd }),
              }, t("Escribir")),
              this.childButton(s))),
          ...(this.customizing === s.id && this.store.children.has(s.id) ? [this.designPanel(s)] : []),
        ]),
        ...(this.store.sessions.length === 0 ? [h("div", { class: "muted" }, t("No hay sesiones de Claude Code activas."))] : []),
        ...this.recentRows(),
      );
    };
    const rings = h("div", { class: "rings" });
    const refreshAll = () => {
      refresh();
      void this.loadRecent();
      const usage = this.store.usage;
      rings.replaceChildren(
        ...(usage ? [ring("5 h", usage.fiveHour), ring("7 d", usage.sevenDay), ring(t("contexto"), usage.contextPct === null ? null : { usedPct: usage.contextPct, resetsAt: null })] : []),
      );
    };
    return { el: h("div", { class: "tab" }, h("h3", {}, t("Sesiones de Claude Code")), rings, hooks, list), refresh: refreshAll };
  }

  private vaultTab(): TabBody {
    const body = h("div", { class: "tab" });
    let detected: string[] | null = null;
    const refresh = () => {
      const vault = this.store.settings.vaultPath;
      if (!vault) {
        if (detected === null) {
          detected = [];
          void api.detectVaults().then((v) => { detected = v; refresh(); });
        }
        const path = h("input", { class: "field small", placeholder: "C:\\ruta\\a\\tu\\vault" });
        body.replaceChildren(
          h("h3", {}, t("Conecta tu vault de Obsidian")),
          h("div", { class: "muted small" }, t("Cualquier tarea “- [ ] algo #claude” de tus notas se convierte en un encargo para Claude, y la respuesta se escribe bajo la tarea.")),
          ...detected.map((p) => h("button", { class: "btn block", onclick: () => void this.save({ vaultPath: p }).then(refresh) }, `📓 ${p}`)),
          h("div", { class: "row" }, path, h("button", { class: "btn ok", onclick: () => path.value.trim() && void this.save({ vaultPath: path.value.trim() }).then(refresh) }, t("Usar"))),
        );
        return;
      }
      const add = h("input", { class: "field small", placeholder: t("Añadir tarea a la bandeja de Obsidian") });
      const addTask = async () => {
        const text = add.value.trim();
        if (!text) return;
        add.value = "";
        try { await api.vaultAddTask(text); this.store.vaultTasks = await api.scanVault(); this.refresh(); } catch (err) { this.say(errorText(err), 6000); }
      };
      add.addEventListener("keydown", (event) => { if (event.key === "Enter") void addTask(); });
      body.replaceChildren(
        h("h3", {}, t("Obsidian")),
        h("div", { class: "muted small" }, t("Vault: {name}", { name: baseName(vault) })),
        h("div", { class: "row" }, add, h("button", { class: "btn", onclick: () => void addTask() }, t("Añadir"))),
        h("div", { class: "list" },
          ...this.store.vaultTasks.slice(0, 8).map((task) =>
            h("div", { class: "item" },
              h("div", { class: "item-main" },
                h("div", { class: "item-title" }, clip(task.text, 80)),
                h("div", { class: "muted small" }, task.file)),
              h("button", { class: "btn ok", title: t("Ejecutar con Claude"), onclick: () => void this.send(task.text, task) }, "▶"),
              h("button", { class: "btn", title: t("Abrir en Obsidian"), onclick: () => void this.openNote(task.file) }, "↗"))),
          this.store.vaultTasks.length === 0 && h("div", { class: "muted" }, t("Sin tareas. Escribe “- [ ] algo #claude” en cualquier nota.")),
          this.store.vaultTasks.length > 8 && h("div", { class: "muted small" }, t("…y {n} más", { n: this.store.vaultTasks.length - 8 }))),
      );
    };
    return { el: body, refresh };
  }

  private settingsTab(): TabBody {
    const s = this.store.settings;
    type Flag = "allowEdits" | "autoApprove" | "mini" | "remoteView";
    const check = (label: string, key: Flag, hint: string) =>
      h("label", { class: "check" },
        h("input", { type: "checkbox", checked: s[key], onchange: (e: Event) => void this.save({ [key]: (e.target as HTMLInputElement).checked }) }),
        h("span", {}, label, h("div", { class: "muted small" }, hint)));
    const text = (value: string, placeholder: string, key: "vaultPath" | "telegramToken" | "telegramChatId" | "slackWebhook" | "feishuWebhook", type = "text") => {
      const input = h("input", { class: "field small", value, placeholder, type, autocomplete: "off" });
      input.addEventListener("change", () => void this.save({ [key]: input.value.trim() }));
      return input;
    };
    const themes = h("div", { class: "row wrap" });
    const languages = h("div", { class: "row wrap" });
    const phone = h("div", { class: "muted small phone" });
    const hooks = h("div", { class: "row" });
    const cli = h("div", { class: "row" });
    // Diagnostics: which hook events actually reach the NPC (names only), to tell what each client sends.
    const diag = h("div", { class: "diag" });
    const showDiag = async () => {
      const log = await api.hookLog().catch(() => []);
      const counts = new Map<string, number>();
      for (const entry of log) counts.set(entry.event, (counts.get(entry.event) ?? 0) + 1);
      diag.replaceChildren(
        h("div", { class: "muted small" }, t("Últimos {n} eventos recibidos de Claude Code:", { n: log.length })),
        h("div", { class: "small" }, [...counts].map(([event, n]) => `${event} ×${n}`).join(" · ") || t("Ninguno todavía.")),
        h("div", { class: "small" }, counts.has("PermissionRequest")
          ? t("✅ Llegan peticiones de permiso: salen como tarjeta.")
          : t("⚠ Aún no ha llegado ninguna petición de permiso (PermissionRequest).")),
        ...log.slice(0, 14).map((e) =>
          h("div", { class: "muted small diag-line" }, `${new Date(e.ms).toLocaleTimeString()} · ${e.event}${e.tool ? ` · ${e.tool}` : ""} · ${e.session}${e.note ? ` — ${e.note}` : ""}`)));
    };

    const petPath = h("input", { class: "field small", placeholder: t("Ruta de la carpeta del pet") });
    const importPet = async () => {
      if (!petPath.value.trim()) return;
      try {
        const pet = await api.importPet(petPath.value);
        petPath.value = "";
        await this.onThemesChanged();
        await this.save({ theme: `pet:${pet.id}` });
        this.say(t("Pet importado: {name}", { name: pet.label }), 5000);
      } catch (err) {
        this.say(errorText(err), 8000);
      }
    };
    const themeUrl = h("input", { class: "field small", placeholder: t("https://…/tema.json") });
    const installTheme = async () => {
      if (!themeUrl.value.trim()) return;
      try {
        const theme = await api.installTheme(themeUrl.value);
        themeUrl.value = "";
        await this.onThemesChanged();
        await this.save({ theme: theme.id });
        this.say(t("Tema instalado: {name}", { name: theme.label }), 5000);
      } catch (err) {
        this.say(errorText(err), 8000);
      }
    };

    const refresh = () => {
      const current = this.store.settings;
      themes.replaceChildren(
        ...Object.entries(THEMES).map(([id, theme]) =>
          h("button", { class: `btn${current.theme === id ? " ok" : ""}`, onclick: () => void this.save({ theme: id }) }, theme.label)),
        ...this.store.pets.map((pet) =>
          h("button", { class: `btn${current.theme === `pet:${pet.id}` ? " ok" : ""}`, onclick: () => void this.save({ theme: `pet:${pet.id}` }) }, `🐾 ${pet.label}`)),
      );
      languages.replaceChildren(
        h("button", { class: `btn${current.language === "auto" ? " ok" : ""}`, onclick: () => void this.save({ language: "auto" }) }, t("Automático")),
        ...(Object.entries(LANGS) as Array<[Lang, string]>).map(([code, label]) =>
          h("button", { class: `btn${current.language === code ? " ok" : ""}`, onclick: () => void this.save({ language: code }) }, label)),
      );
      hooks.replaceChildren(
        h("span", {}, this.store.hooksInstalled ? t("🟢 Hooks de Claude Code conectados") : t("⚪ Hooks sin conectar")),
        this.store.hooksInstalled
          ? h("button", { class: "btn", onclick: () => void api.uninstallHooks().then(() => this.recheckHooks()).catch((e) => this.say(errorText(e), 6000)) }, t("Quitar"))
          : h("button", { class: "btn ok", onclick: () => void this.installHooks() }, t("Conectar")));
      cli.replaceChildren(
        h("span", {}, this.cliAuth === null ? t("⚪ Comprobando el CLI de Claude…") : this.cliAuth ? t("🟢 CLI de Claude con sesión iniciada") : t("⚪ CLI de Claude sin sesión")),
        ...(this.cliAuth === false ? [h("button", { class: "btn ok", onclick: () => void this.login() }, t("Iniciar sesión"))] : []));
      if (current.remoteView) {
        void api.remoteInfo().then((url) => { phone.textContent = url ? t("Abre en el móvil (misma red): {url}", { url }) : ""; });
      } else {
        phone.textContent = "";
      }
    };

    // Activity slider: previews live while dragging, saves on release.
    const activityLabel = h("div", { class: "activity-label" });
    const describeActivityLevel = (v: number) =>
      v <= 15 ? t("😴 Dormilón: pasa casi todo el rato quieto o durmiendo")
        : v <= 40 ? t("😌 Tranquilo: se mueve poco y duerme bastante")
          : v <= 60 ? t("🙂 Normal")
            : v <= 85 ? t("😄 Activo: anda y hace cosas a menudo")
              : t("🤪 Hiperactivo: no para quieto ni un segundo");
    const slider = h("input", { type: "range", min: "0", max: "100", step: "5", class: "slider", value: String(s.activity) });
    const showLevel = () => { activityLabel.textContent = describeActivityLevel(Number(slider.value)); };
    slider.addEventListener("input", () => { showLevel(); this.npc.setActivity(Number(slider.value)); });
    slider.addEventListener("change", () => void this.save({ activity: Number(slider.value) }));
    showLevel();

    /** Collapsible group of related settings. */
    const section = (title: string, open: boolean, ...children: Array<Child>) =>
      h("details", { class: "section", open }, h("summary", {}, title), h("div", { class: "section-body" }, ...children));

    const pane = (...children: Array<Child>) => h("div", { class: "pane" }, ...children);
    const panes: Record<SettingsSection, HTMLElement> = {
      look: pane(
        section(t("Idioma"), true, languages),
        section(t("Personaje"), true, themes,
          check(t("Modo mini"), "mini", t("Se asoma por el borde derecho de la pantalla. También: doble clic sobre el personaje."))),
        section(t("Importar y temas"), false,
          h("div", { class: "muted small" }, t("Importar un Codex Pet (carpeta con pet.json)")),
          h("div", { class: "row" }, petPath, h("button", { class: "btn", onclick: () => void importPet() }, t("Importar"))),
          h("div", { class: "muted small" }, t("Instalar un tema desde una URL (JSON de paleta)")),
          h("div", { class: "row" }, themeUrl, h("button", { class: "btn", onclick: () => void installTheme() }, t("Instalar"))))),
      activity: pane(
        section(t("Hiperactividad"), true,
          h("div", { class: "muted small" }, t("Cuánto se mueve tu mascota por la pantalla. Más hiperactivo, más anda y hace cosas; más tranquilo, más rato pasa quieto y durmiendo.")),
          h("div", { class: "slider-row" }, h("span", {}, "😴"), slider, h("span", {}, "⚡")),
          h("div", { class: "slider-ends muted small" }, h("span", {}, t("Tranquilo")), h("span", {}, t("Hiperactivo"))),
          activityLabel)),
      claude: pane(
        section(t("Conexión"), true, hooks, cli,
          h("div", { class: "row" }, h("button", { class: "btn", onclick: () => void showDiag() }, t("Ver eventos recibidos"))), diag),
        section(t("Permisos y edición"), true,
          check(t("Permitir que Claude edite archivos"), "allowEdits", t("Tareas lanzadas desde aquí usan acceptEdits.")),
          check(t("Aprobar permisos automáticamente"), "autoApprove", t("⚠ Responde “Permitir” a todo sin preguntar.")),
          h("div", { class: "muted small" }, t("Atajos globales: Ctrl+Alt+Y permitir · Ctrl+Alt+N denegar"))),
        section(t("Vault de Obsidian"), false, text(s.vaultPath, t("Carpeta de tu vault de Obsidian"), "vaultPath"))),
      links: pane(
        section(t("Aprobar desde Telegram (opcional)"), false,
          text(s.telegramToken, t("Token del bot (de @BotFather)"), "telegramToken", "password"),
          text(s.telegramChatId, t("ID de tu chat"), "telegramChatId")),
        section(t("Avisos en Slack / Feishu (solo notificaciones)"), false,
          text(s.slackWebhook, t("URL del webhook de Slack"), "slackWebhook", "password"),
          text(s.feishuWebhook, t("URL del webhook de Feishu/Lark"), "feishuWebhook", "password")),
        section(t("Vista del móvil (solo lectura)"), false,
          check(t("Vista del móvil (solo lectura)"), "remoteView", t("Sirve tus sesiones en la red local con un enlace secreto. Sin cifrar: úsalo solo en una red de confianza.")),
          phone)),
    };

    const SETTINGS_SECTIONS: Array<[SettingsSection, string, string]> = [
      ["look", "🎨", t("Aspecto")], ["activity", "⚡", t("Actividad")], ["claude", "🤖", "Claude"], ["links", "🔌", t("Conexiones")],
    ];
    const tabs = h("div", { class: "subtabs" });
    const showSection = () => {
      tabs.replaceChildren(...SETTINGS_SECTIONS.map(([id, icon, label]) =>
        h("button", { class: `subtab${this.settingsSection === id ? " on" : ""}`, title: label, onclick: () => { this.settingsSection = id; showSection(); } },
          icon, h("span", {}, label))));
      for (const [id, el] of Object.entries(panes)) el.style.display = id === this.settingsSection ? "flex" : "none";
    };
    showSection();

    const baseRefresh = refresh;
    return {
      el: h("div", { class: "tab" }, h("h3", {}, t("Ajustes")), tabs, ...Object.values(panes)),
      refresh: () => {
        baseRefresh();
        const saved = String(this.store.settings.activity);
        if (slider.value !== saved && document.activeElement !== slider) { slider.value = saved; showLevel(); }
      },
    };
  }

  // ---- shared actions -------------------------------------------------------------

  async save(patch: Partial<Settings>) {
    const languageBefore = this.store.settings.language;
    try {
      this.store.settings = await api.updateSettings({ ...this.store.settings, ...patch });
      if ("vaultPath" in patch) this.store.vaultTasks = await api.scanVault().catch(() => []);
    } catch (err) {
      this.say(errorText(err), 6000);
    }
    this.onSettingsChanged();
    if (this.store.settings.language !== languageBefore) this.relocalize();
    else this.refresh();
  }

  async installHooks() {
    try {
      await api.installHooks();
      this.say(t("Conectado. Reinicia las sesiones de Claude Code abiertas para que lo noten."), 7000);
    } catch (err) {
      this.say(errorText(err), 7000);
    }
    await this.recheckHooks();
  }

  async recheckHooks() {
    this.store.hooksInstalled = await api.hooksInstalled().catch(() => false);
    this.refresh();
  }

  applyTaskUpdate(update: TaskUpdate) {
    let task = this.store.tasks.find((t) => t.id === update.id);
    if (update.kind === "start") {
      task = { id: update.id, prompt: update.vault?.text ?? update.text ?? "", status: "running", line: t("Empezando…"), vault: update.vault, noteOpen: false, cwd: update.cwd, resumeOf: update.resume ?? undefined };
      this.store.tasks.unshift(task);
    }
    if (!task) return;
    if (update.kind === "session") task.sessionId = update.sessionId;
    if (update.kind === "text" && update.text) task.line = update.text.split("\n").filter(Boolean).pop() ?? task.line;
    if (update.kind === "text" || update.kind === "tool") task.usingTool = update.kind === "tool";
    if (update.kind === "tool") task.line = describeActivity(update.tool, update.text);
    if (update.kind === "result") {
      const cancelled = update.text === "Cancelled";
      task.status = cancelled ? "cancelled" : update.ok ? "ok" : "error";
      task.result = update.text ?? "";
      task.note = update.note === "Written back to your note" ? t("Respuesta escrita en tu nota") : update.note;
      task.noteOpen = !cancelled;
      if (task.status === "error" && isAuthError(task.result)) this.cliAuth = false;
      task.line = cancelled ? t("Cancelada") : task.line;
    }
    this.refresh();
  }
}
