// The "children": small copies of the character the user chooses to spawn for a Claude Code
// session. Which sessions have one, and how each looks, is kept in the browser's local storage.

import { HUES, type HatId, type Look } from "./sprite";

export interface ChildLook extends Look {
  /** When it was spawned (ms); keeps the line in a stable order and lets old ones expire. */
  created: number;
}

const KEY = "claude-npc.children";
const DISMISSED_KEY = "claude-npc.children-dismissed";
const KEEP_MS = 14 * 24 * 3600_000;

export class Children {
  private readonly looks = new Map<string, ChildLook>();
  /** Sessions whose child the user sent away; they do not get a new one on their own. */
  private readonly dismissed = new Set<string>();
  /** Called after any change, so the screen and the lists can follow. */
  onChange: () => void = () => {};

  constructor() {
    this.load();
  }

  has(sessionId: string): boolean {
    return this.looks.has(sessionId);
  }

  get(sessionId: string): ChildLook | undefined {
    return this.looks.get(sessionId);
  }

  get count(): number {
    return this.looks.size;
  }

  /** Spawns a child for the session, in a colour no other child wears yet if there is one left. */
  add(sessionId: string) {
    this.dismissed.delete(sessionId);
    if (this.spawn(sessionId)) this.changed();
  }

  /** Makes sure every given session has a child, except those the user sent away. */
  ensure(sessionIds: string[]) {
    let any = false;
    for (const id of sessionIds) {
      if (!this.dismissed.has(id) && this.spawn(id)) any = true;
    }
    if (any) this.changed();
  }

  remove(sessionId: string) {
    this.dismissed.add(sessionId);
    this.looks.delete(sessionId);
    this.changed();
  }

  private spawn(sessionId: string): boolean {
    if (this.looks.has(sessionId)) return false;
    const used = new Set([...this.looks.values()].map((l) => l.hue));
    const hue = HUES.find((h) => !used.has(h)) ?? HUES[this.looks.size % HUES.length];
    this.looks.set(sessionId, { hue, hat: "none", created: Date.now() });
    return true;
  }

  setLook(sessionId: string, patch: { hue?: number; hat?: HatId }) {
    const look = this.looks.get(sessionId);
    if (!look) return;
    this.looks.set(sessionId, { ...look, ...patch });
    this.changed();
  }

  private changed() {
    this.save();
    this.onChange();
  }

  private load() {
    try {
      const gone = JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? "[]");
      if (Array.isArray(gone)) for (const id of gone) if (typeof id === "string") this.dismissed.add(id);
      const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, ChildLook>;
      const now = Date.now();
      for (const [id, look] of Object.entries(raw)) {
        if (typeof look?.hue === "number" && typeof look.created === "number" && now - look.created < KEEP_MS) {
          this.looks.set(id, { hue: look.hue, hat: look.hat ?? "none", created: look.created });
        }
      }
    } catch {
      // Storage can be unavailable or hold junk; start with no children.
    }
  }

  private save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(this.looks)));
      localStorage.setItem(DISMISSED_KEY, JSON.stringify([...this.dismissed].slice(-200)));
    } catch {
      // Not being able to remember them is not worth an error.
    }
  }
}
