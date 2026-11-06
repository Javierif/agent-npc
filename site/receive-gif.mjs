// Tiny local receiver for site/hero-gif.html: saves the posted GIF to docs/media/hero.gif.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "docs", "media", "hero.gif");
http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, Buffer.concat(chunks));
    console.log("saved", out, Buffer.concat(chunks).length);
    res.writeHead(200); res.end("ok");
  });
}).listen(1431, "127.0.0.1", () => console.log("listening on 1431"));
