// Dev tool: renders the hero GIF (the four characters in a short sketch) from src/sprite.ts.
// Run `npm run site`, open /hero-gif.html, and it POSTs the GIF to the receiver started by
// `node site/receive-gif.mjs` (writes docs/media/hero.gif). Nothing here ships with the site.
import { renderPose, setTheme, type Pose } from "../src/sprite";

const W = 640, H = 300, S = 5, FPS = 10, GROUND = 272;
const CAST = [
  { id: "rana", x: 100, name: "Rana" },
  { id: "pato", x: 245, name: "Pato" },
  { id: "hamster", x: 395, name: "Hamster" },
  { id: "postie", x: 540, name: "Postie" },
];
const FRAMES = 96;
const frameSets = new Map<string, Map<Pose, HTMLCanvasElement>>();
const POSES: Pose[] = ["idle", "blink", "walk1", "walk2", "sleep1", "sleep2", "work1", "work2", "juggle1", "juggle2",
  "fly1", "fly2", "fly3", "tongue", "gulp", "croak1", "croak2", "alert1", "alert2", "angry1", "angry2", "cover1", "cover2",
  "nod1", "nod2", "shake", "yawn1", "yawn2", "dance1", "dance2", "dance3", "happy1", "happy2", "sad", "look", "wave1", "wave2"];
for (const c of CAST) {
  setTheme(c.id);
  const m = new Map<Pose, HTMLCanvasElement>();
  for (const p of POSES) m.set(p, renderPose(p, S));
  frameSets.set(c.id, m);
}

const cv = document.createElement("canvas");
cv.width = W; cv.height = H;
document.body.append(cv);
const ctx = cv.getContext("2d", { willReadFrequently: true })!;
ctx.imageSmoothingEnabled = false;

// Pixel text: draw small, threshold, scale up with nearest neighbour so no antialiased colours appear.
const tmp = document.createElement("canvas");
const tctx = tmp.getContext("2d", { willReadFrequently: true })!;
function text(str: string, x: number, y: number, color: string, px = 2): number {
  tctx.font = "bold 8px monospace";
  const w = Math.ceil(tctx.measureText(str).width) + 1;
  tmp.width = w; tmp.height = 11;
  tctx.font = "bold 8px monospace";
  tctx.textBaseline = "top";
  tctx.fillStyle = "#000";
  tctx.fillText(str, 0, 1);
  const d = tctx.getImageData(0, 0, w, 11).data;
  ctx.fillStyle = color;
  for (let j = 0; j < 11; j++) for (let i = 0; i < w; i++) if (d[(j * w + i) * 4 + 3] > 110) ctx.fillRect(x + i * px, y + j * px, px, px);
  return w * px;
}
function textW(str: string, px = 2): number {
  tctx.font = "bold 8px monospace";
  return (Math.ceil(tctx.measureText(str).width) + 1) * px;
}

function box(x: number, y: number, w: number, h: number, fill: string, border = "#3a2820") {
  ctx.fillStyle = border; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = fill; ctx.fillRect(x + 3, y + 3, w - 6, h - 6);
  ctx.fillStyle = border;
  for (const [cx, cy] of [[x, y], [x + w - 3, y], [x, y + h - 3], [x + w - 3, y + h - 3]]) ctx.fillRect(cx, cy, 3, 3);
  ctx.fillStyle = "#fdf1e6";
  for (const [cx, cy] of [[x, y], [x + w - 3, y], [x, y + h - 3], [x + w - 3, y + h - 3]]) ctx.fillRect(cx, cy, 3, 3);
}
function bubble(cx: number, str: string) {
  const w = textW(str) + 20, h = 34, x = Math.round(cx - w / 2), y = 128;
  box(x, y, w, h, "#ffffff");
  ctx.fillStyle = "#3a2820"; ctx.fillRect(cx - 6, y + h, 12, 3); ctx.fillRect(cx - 3, y + h + 3, 6, 3);
  ctx.fillStyle = "#ffffff"; ctx.fillRect(cx - 3, y + h - 3, 6, 3);
  text(str, x + 10, y + 7, "#3a2820");
}

function pick<T>(list: T[], t: number, every: number): T { return list[Math.floor(t / every) % list.length]; }

function poseFor(i: number, t: number): { pose: Pose; dx?: number; dy?: number; say?: string } {
  // 0-17: parade in from the left, walking.
  if (t < 18) return { pose: pick<Pose>(["walk1", "walk2"], t, 2), dx: -(18 - t) * 34 };
  // 18-23: a little wave hello.
  if (t < 24) return { pose: pick<Pose>(["wave1", "wave2"], t, 2) };
  // 24-53: everyone minds their own business.
  if (t < 54) {
    const u = t - 24;
    if (i === 0) {
      if (u < 5) return { pose: "fly1" };
      if (u < 10) return { pose: "fly2" };
      if (u < 15) return { pose: "fly3" };
      if (u < 19) return { pose: "tongue" };
      if (u < 25) return { pose: "gulp", say: u < 23 ? "*gulp*" : undefined };
      return { pose: pick<Pose>(["croak1", "croak2"], u, 2), say: "tasty" };
    }
    if (i === 1) return { pose: pick<Pose>(["work1", "work2"], u, 2), say: u > 3 && u < 22 ? "npm install..." : undefined };
    if (i === 2) return { pose: pick<Pose>(["juggle1", "juggle2"], u, 3), say: u > 14 && u < 28 ? "look, no hands" : undefined };
    return { pose: pick<Pose>(["sleep1", "sleep2"], u, 5) };
  }
  // 54-79: Claude wants to run something scary.
  if (t < 80) {
    const u = t - 54;
    if (i === 0) return { pose: pick<Pose>(["alert1", "alert2"], u, 2), say: u < 16 ? "!!!" : undefined, dy: u < 16 ? 0 : 0 };
    if (i === 1) return { pose: pick<Pose>(["angry1", "angry2"], u, 2), say: u < 16 ? "NOPE" : undefined };
    if (i === 2) return { pose: pick<Pose>(["cover1", "cover2"], u, 4), say: u < 16 ? "I can't look" : undefined };
    if (u < 8) return { pose: pick<Pose>(["sleep1", "sleep2"], u, 4), say: "zzz" };
    if (u < 12) return { pose: pick<Pose>(["yawn1", "yawn2"], u, 2) };
    if (u < 16) return { pose: "look", say: "huh?" };
    return { pose: pick<Pose>(["alert1", "alert2"], u, 2) };
  }
  // 80-87: relief.
  if (t < 88) {
    const u = t - 80;
    if (i === 3) return { pose: pick<Pose>(["nod1", "nod2"], u, 2), say: "wait, what?" };
    return { pose: pick<Pose>(["nod1", "nod2"], u + i, 2), say: i === 0 ? "phew" : undefined };
  }
  // 88-96: party.
  const u = t - 88;
  return { pose: pick<Pose>(["dance1", "dance2", "dance3", "dance2"], u + i, 2) };
}

function card(t: number) {
  // Permission card: slides in at 54, the pointer clicks Deny at 74, "Denied" until 88.
  const show = t >= 54 && t < 88;
  if (!show) return;
  const w = 380, h = 100, x = (W - w) / 2, y = 8;
  box(x, y, w, h, "#fff8f1");
  text("Claude wants to run:", x + 16, y + 12, "#7a6a62");
  const denied = t >= 76;
  text(denied ? "rm -rf /   (denied)" : "rm -rf /", x + 16, y + 34, denied ? "#2f9e44" : "#e5484d", 3);
  const by = y + 64;
  const hot = t >= 74 && t < 76;
  box(x + 16, by, 120, 28, "#bde5c8"); text("Allow", x + 46, by + 5, "#3a2820");
  box(x + 150, by, 120, 28, hot ? "#ff9aa2" : "#f6c7c7"); text("Deny", x + 188, by + 5, "#3a2820");
  // pointer
  if (t >= 60 && t < 80) {
    const k = Math.min(1, (t - 60) / 14);
    const px = x + 330 + (x + 210 - (x + 330)) * k, py = by + 60 - 40 * k;
    ctx.fillStyle = "#000";
    for (let r = 0; r < 12; r++) ctx.fillRect(Math.round(px), Math.round(py) + r * 2, (r < 8 ? r + 1 : 14 - r) * 2, 2);
    ctx.fillStyle = "#fff";
    for (let r = 1; r < 10; r++) ctx.fillRect(Math.round(px) + 2, Math.round(py) + r * 2, Math.max(0, (r < 8 ? r - 1 : 12 - r)) * 2, 2);
  }
}

function confetti(t: number) {
  if (t < 88) return;
  const cols = ["#ff5a5a", "#ffd966", "#6ec6ff", "#9bff6b", "#f28b8b"];
  for (let n = 0; n < 40; n++) {
    const sx = (n * 97) % W, sp = 6 + (n % 5) * 3;
    const y = ((t - 88) * sp * 2 + n * 31) % 260;
    ctx.fillStyle = cols[n % cols.length];
    ctx.fillRect(sx + Math.round(Math.sin((t + n) / 2) * 6), y, 6, 6);
  }
  const msg = "Task done!";
  box((W - textW(msg, 3) - 28) / 2, 20, textW(msg, 3) + 28, 52, "#ffffff");
  text(msg, (W - textW(msg, 3)) / 2, 33, "#3a2820", 3);
}

function draw(t: number) {
  ctx.fillStyle = "#fdf1e6"; ctx.fillRect(0, 0, W, H);
  // taskbar
  ctx.fillStyle = "#2b2b33"; ctx.fillRect(0, GROUND, W, H - GROUND);
  ctx.fillStyle = "#4b5560"; ctx.fillRect(0, GROUND, W, 2);
  ctx.fillStyle = "#6ec6ff"; ctx.fillRect(14, GROUND + 7, 14, 14);
  for (let k = 0; k < 6; k++) { ctx.fillStyle = k === 2 ? "#f4a67a" : "#5a6270"; ctx.fillRect(48 + k * 26, GROUND + 8, 16, 12); }
  CAST.forEach((c, i) => {
    const p = poseFor(i, t);
    const img = frameSets.get(c.id)!.get(p.pose)!;
    ctx.drawImage(img, Math.round(c.x - img.width / 2 + (p.dx ?? 0)), GROUND - img.height + 4 + (p.dy ?? 0));
  });
  CAST.forEach((c, i) => { const p = poseFor(i, t); if (p.say && !(p.dx)) bubble(c.x, p.say); });
  card(t);
  confetti(t);
}

// ---------- GIF encoder (LZW) ----------
function lzw(idx: Uint8Array, minCode: number): Uint8Array {
  const clear = 1 << minCode, eoi = clear + 1;
  const out: number[] = [];
  let cur = 0, nbits = 0, size = minCode + 1, next = eoi + 1;
  const put = (code: number) => {
    cur |= code << nbits; nbits += size;
    while (nbits >= 8) { out.push(cur & 255); cur >>>= 8; nbits -= 8; }
  };
  let dict = new Map<number, number>();
  put(clear);
  let prefix = idx[0];
  for (let i = 1; i < idx.length; i++) {
    const k = idx[i], key = (prefix << 8) | k;
    const hit = dict.get(key);
    if (hit !== undefined) { prefix = hit; continue; }
    put(prefix);
    if (next < 4096) {
      dict.set(key, next++);
      if (next - 1 === (1 << size) && size < 12) size++;
    } else {
      put(clear); dict = new Map(); next = eoi + 1; size = minCode + 1;
    }
    prefix = k;
  }
  put(prefix); put(eoi);
  if (nbits > 0) out.push(cur & 255);
  return Uint8Array.from(out);
}

function encode(frames: Uint8ClampedArray[]): Uint8Array {
  // Global palette from every distinct colour (must fit in 256).
  const map = new Map<number, number>();
  const pal: number[] = [];
  const idxFrames = frames.map((f) => {
    const ix = new Uint8Array(W * H);
    for (let p = 0; p < W * H; p++) {
      const c = (f[p * 4] << 16) | (f[p * 4 + 1] << 8) | f[p * 4 + 2];
      let v = map.get(c);
      if (v === undefined) {
        if (pal.length >= 256) {
          // nearest existing colour
          let best = 0, bd = 1e9;
          pal.forEach((q, n) => { const d = ((q >> 16) - (c >> 16)) ** 2 + (((q >> 8) & 255) - ((c >> 8) & 255)) ** 2 + ((q & 255) - (c & 255)) ** 2; if (d < bd) { bd = d; best = n; } });
          v = best;
        } else { v = pal.length; pal.push(c); }
        map.set(c, v);
      }
      ix[p] = v;
    }
    return ix;
  });
  console.log("palette size", pal.length);
  const b: number[] = [];
  const w16 = (n: number) => b.push(n & 255, n >> 8);
  b.push(...[..."GIF89a"].map((c) => c.charCodeAt(0)));
  w16(W); w16(H); b.push(0xf7, 0, 0);
  for (let n = 0; n < 256; n++) { const c = pal[n] ?? 0; b.push(c >> 16, (c >> 8) & 255, c & 255); }
  b.push(0x21, 0xff, 11, ...[..."NETSCAPE2.0"].map((c) => c.charCodeAt(0)), 3, 1, 0, 0, 0);
  for (let f = 0; f < idxFrames.length; f++) {
    const delay = f === idxFrames.length - 1 ? 150 : Math.round(100 / FPS);
    b.push(0x21, 0xf9, 4, 0, delay & 255, delay >> 8, 0, 0);
    b.push(0x2c); w16(0); w16(0); w16(W); w16(H); b.push(0);
    b.push(8);
    const data = lzw(idxFrames[f], 8);
    for (let o = 0; o < data.length; o += 255) { const n = Math.min(255, data.length - o); b.push(n); for (let k = 0; k < n; k++) b.push(data[o + k]); }
    b.push(0);
  }
  b.push(0x3b);
  return Uint8Array.from(b);
}

const frames: Uint8ClampedArray[] = [];
for (let t = 0; t < FRAMES; t++) { draw(t); frames.push(ctx.getImageData(0, 0, W, H).data.slice()); }
const gif = encode(frames);
const url = URL.createObjectURL(new Blob([gif], { type: "image/gif" }));
const img = document.createElement("img");
img.src = url;
document.body.append(img);
(window as unknown as { gifBytes: Uint8Array; previewT: (t: number) => void }).gifBytes = gif;
(window as unknown as { previewT: (t: number) => void }).previewT = (t) => draw(t);
document.title = "gif " + gif.length;
const status = document.createElement("p");
status.textContent = `${(gif.length / 1024).toFixed(0)} KB, ${FRAMES} frames`;
document.body.append(status);
fetch("http://127.0.0.1:1431/hero.gif", { method: "POST", body: gif }).then((r) => (status.textContent += ` - saved (${r.status})`)).catch(() => (status.textContent += " - receiver not running"));
