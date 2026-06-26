import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const engine = await readFile(resolve(root, "src/checkglyphs.js"), "utf8");

const context = vm.createContext({
  console,
  Math,
  Number,
  String,
  BigInt,
  min: Math.min,
  max: Math.max,
  floor: Math.floor,
  ceil: Math.ceil,
  sqrt: Math.sqrt
});

vm.runInContext(
  `${engine}\n
checks = [{
  sourceX: 188,
  sourceY: 152,
  sourceScale: 1,
  path25: Array.from({ length: 25 }, (_, index) => ({ x: index % 5, y: Math.floor(index / 5) })),
  visibleIndices: [0, 1],
  glyphTraversal: [0, 1],
  visibleColorMap: { 0: "#ff0000", 1: "#00ff00" }
}];
svgLayout = {
  root: { w: 680, h: 680 },
  panel: { x: 188, y: 152, w: 304, h: 376 }
};
renderBox = { x: 752, y: 608, w: 1216, h: 1504 };
loadedTokenId = "1";

globalThis.__rendererSmoke = {
  exactLayout: checksHaveExactSvgLayout(),
  svg: buildGlyphsSVGDocument()
};`,
  context,
  { filename: "checkglyphs.js" }
);

const result = context.__rendererSmoke;
if (!result?.exactLayout) {
  throw new Error("Exact SVG layout validation failed.");
}

if (!result.svg.includes('<g id="glyphs">')) {
  throw new Error("SVG glyph group was not generated.");
}

const glyphLayer = result.svg.split('<g id="glyphs">')[1] || "";
if (!glyphLayer.includes('fill="#ff0000"') || !glyphLayer.includes('fill="#00ff00"')) {
  throw new Error("SVG glyph colors were not generated from deterministic glyph data.");
}

if (/\sstroke=/.test(glyphLayer)) {
  throw new Error("Glyph cells must not contain perimeter stroke attributes.");
}

if (!result.svg.includes(`width="1360"`) || !result.svg.includes(`height="1360"`)) {
  throw new Error("SVG display size should default to 1360x1360 while preserving a larger internal viewBox.");
}

console.log("Canvas/SVG renderer smoke test passed.");
