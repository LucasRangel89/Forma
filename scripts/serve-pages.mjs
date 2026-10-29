import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";

// Small local preview server for the generated Pages artifact, not a production API.
const root = resolve("out");
const base = (process.env.NEXT_PUBLIC_BASE_PATH ?? "/Forma").replace(/\/$/, "");
const port = Number(process.env.PORT ?? 4174);
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".png": "image/png", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8", ".json": "application/json; charset=utf-8" };

createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (base && (url.pathname === "/" || url.pathname === base)) { response.writeHead(302, { Location: `${base}/` }).end(); return; }
    if (base && !url.pathname.startsWith(`${base}/`)) { response.writeHead(404).end("Não encontrado"); return; }
    const pathname = decodeURIComponent(url.pathname.slice(base.length));
    const file = resolve(join(root, pathname, pathname.endsWith("/") ? "index.html" : ""));
    if (file !== root && !file.startsWith(`${root}${sep}`)) { response.writeHead(403).end(); return; }
    const info = await stat(file);
    if (!info.isFile()) throw new Error("Não encontrado");
    response.writeHead(200, { "Content-Type": mime[extname(file)] ?? "application/octet-stream", "Content-Length": info.size, "Cache-Control": "no-cache" });
    if (request.method === "HEAD") response.end();
    else createReadStream(file).pipe(response);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Não encontrado");
  }
}).listen(port, "0.0.0.0", () => console.log(`Prévia estática em http://localhost:${port}${base}/`));
