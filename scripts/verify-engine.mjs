import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const manifest = await readFile(new URL("../ENGINE_SHA256.txt", import.meta.url), "utf8");
const expected = manifest.trim().split(/\s+/)[0];
const source = await readFile(new URL("../src/checkglyphs.js", import.meta.url));
const actual = createHash("sha256").update(source).digest("hex");

if (actual !== expected) {
  console.error("Engine integrity check failed.");
  console.error(`Expected: ${expected}`);
  console.error(`Actual:   ${actual}`);
  process.exit(1);
}

console.log("Engine integrity check passed.");
