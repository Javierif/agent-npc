// Dev tool: renders docs/media/characters.png (the four characters in a row) from src/sprite.ts.
// Run `npm run site` + `node site/receive-gif.mjs`, then open /characters-png.html.
import { renderPose, setTheme } from "../src/sprite";

const CAST: Array<[string, string]> = [["postie", "Postie"], ["rana", "Don Rana"], ["pato", "Don Pato"], ["hamster", "Don Hámster"]];
const S = 8, CELL = 200, W = CELL * CAST.length, H = 230;
const cv = document.createElement("canvas");
cv.width = W; cv.height = H;
document.body.append(cv);
const ctx = cv.getContext("2d")!;
ctx.imageSmoothingEnabled = false;
ctx.fillStyle = "#fdf1e6"; ctx.fillRect(0, 0, W, H);
CAST.forEach(([id, label], i) => {
  setTheme(id);
  const img = renderPose("idle", S);
  ctx.drawImage(img, i * CELL + (CELL - img.width) / 2, 12);
  ctx.fillStyle = "#3a2820"; ctx.font = "bold 20px sans-serif"; ctx.textAlign = "center";
  ctx.fillText(label, i * CELL + CELL / 2, 205);
});
cv.toBlob((b) => fetch("http://127.0.0.1:1431/characters.png", { method: "POST", body: b }).then((r) => (document.title = "saved " + r.status)));
