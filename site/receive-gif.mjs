// Tiny local receiver for the generator pages in site/: saves POSTed files to docs/media/<name>.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "docs", "media");
http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
  const name = path.basename(new URL(req.url, "http://x").pathname);
  if (!/^[\w.-]+\.(gif|png)$/.test(name)) { res.writeHead(400); return res.end("bad name"); }
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    fs.mkdirSync(dir, { recursive: true });
    const buf = Buffer.concat(chunks);
    fs.writeFileSync(path.join(dir, name), buf);
    console.log("saved", name, buf.length);
    res.writeHead(200); res.end("ok");
  });
}).listen(1431, "127.0.0.1", () => console.log("listening on 1431"));
