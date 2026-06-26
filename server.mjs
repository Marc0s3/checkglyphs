import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { basename, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)));
const port = Number(process.env.PORT || 4173);

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8"
};

function resolveRequestPath(urlPath) {
  try {
    const decoded = decodeURIComponent((urlPath || "/").split("?")[0]);
    const relative = normalize(decoded).replace(/^([/\\])+/, "");
    const candidate = resolve(join(root, relative || "index.html"));
    return candidate === root || candidate.startsWith(root + sep)
      ? candidate
      : null;
  } catch {
    return null;
  }
}

createServer((request, response) => {
  let filePath = resolveRequestPath(request.url);

  if (!filePath) {
    response.writeHead(403).end("Forbidden");
    return;
  }

  try {
    if (statSync(filePath).isDirectory()) filePath = join(filePath, "index.html");
    const stat = statSync(filePath);

    const contentType = basename(filePath) === "LICENSE"
      ? "text/plain; charset=utf-8"
      : mimeTypes[extname(filePath).toLowerCase()] || "application/octet-stream";

    response.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": stat.size,
      "Cache-Control": "no-store"
    });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`CheckGlyphs running at http://127.0.0.1:${port}`);
});
