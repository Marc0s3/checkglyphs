import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const enginePath = join(root, "src/checkglyphs.js");
const auditDir = join(root, "audit");

function parseColor(value) {
  const input = String(value || "").trim().toLowerCase();
  const named = {
    black: "#000000", white: "#ffffff", red: "#ff0000",
    green: "#008000", blue: "#0000ff", gray: "#808080", grey: "#808080"
  };
  const text = named[input] || input;
  const rgb = text.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (rgb) return { r: Math.round(Number(rgb[1])), g: Math.round(Number(rgb[2])), b: Math.round(Number(rgb[3])) };
  const match = text.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) return { r: 128, g: 128, b: 128 };
  let hex = match[1];
  if (hex.length === 3) hex = hex.split("").map(char => char + char).join("");
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16)
  };
}

const context = vm.createContext({
  console, TextDecoder, TextEncoder, Uint8Array, atob, setTimeout, clearTimeout,
  max: Math.max, min: Math.min, floor: Math.floor, ceil: Math.ceil, round: Math.round,
  abs: Math.abs, pow: Math.pow, sqrt: Math.sqrt,
  constrain: (value, low, high) => Math.min(high, Math.max(low, value)),
  lerp: (a, b, t) => a + (b - a) * t,
  color: parseColor, red: value => value.r, green: value => value.g, blue: value => value.b
});

vm.runInContext(await readFile(enginePath, "utf8"), context, { filename: enginePath });
vm.runInContext(`
function __galleryCheck(input, rawOrder) {
  const colors = input.colors.slice();
  const keyTimes = input.keyTimes.slice();
  const check = {
    x: rawOrder % 8, y: Math.floor(rawOrder / 8),
    sourceX: rawOrder % 8, sourceY: Math.floor(rawOrder / 8), sourceScale: 1,
    row: Math.floor(rawOrder / 8), col: rawOrder % 8,
    colors, keyTimes, rawColors: colors.slice(), rawKeyTimes: keyTimes.slice(),
    initialFill: input.initialFill || colors[0], rawOrder,
    exactSignature: "", word: "", metrics: null, identity: null, initialColor: ""
  };
  check.exactSignature = computeExactTrackSignature(check);
  check.word = computeColorWord(check.colors);
  check.metrics = computeMetrics(check);
  check.identity = buildCheckIdentity(check);
  check.initialColor = getInitialCheckColor(check);
  return check;
}
function __galleryGroup(inputs, options = {}) {
  loadedTokenId = String(options.tokenId || "1");
  loadedTraits = {
    speed: options.speed || "Medium",
    shift: options.shift || "UV",
    gradient: options.gradient || "Linear",
    all: {}
  };
  const used = new Set();
  return inputs.map((input, index) => {
    const selection = selectGlyphDataWithoutCollision(__galleryCheck(input, index), used);
    const glyph = selection.glyphData;
    return {
      visibleIndices: glyph.visibleIndices,
      visibleColorMap: glyph.visibleColorMap,
      profile: glyph.profile,
      collisionAttempt: selection.collisionAttempt
    };
  });
}
`, context);

function buildGroup(inputs, options) {
  context.__galleryInputs = inputs;
  context.__galleryOptions = options;
  const result = vm.runInContext("__galleryGroup(__galleryInputs, __galleryOptions)", context);
  delete context.__galleryInputs;
  delete context.__galleryOptions;
  return JSON.parse(JSON.stringify(result));
}

function xorshift(seed) {
  let value = seed >>> 0;
  return () => {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return (value >>> 0) / 4294967296;
  };
}

const random = xorshift(0x23abc);
const hex = value => value.toString(16).padStart(2, "0");
const randomColor = () => `#${hex(Math.floor(random() * 256))}${hex(Math.floor(random() * 256))}${hex(Math.floor(random() * 256))}`;

function randomTrack() {
  const count = 1 + Math.floor(random() * 8);
  const colors = Array.from({ length: count }, randomColor);
  if (count > 2 && random() < 0.3) colors[count - 1] = colors[0];
  if (count === 1) return { colors, keyTimes: [0], initialFill: colors[0] };
  const cuts = Array.from({ length: count - 2 }, random).sort((a, b) => a - b);
  return { colors, keyTimes: [0, ...cuts, 1], initialFill: colors[0] };
}

const bandTrack = {
  initialFill: "#ef3e44",
  colors: ["#ef3e44", "#ffb23f", "#f5db4d", "#69d68a", "#55c5dc", "#5858b8", "#d63384", "#ef3e44"],
  keyTimes: [0, 0.11, 0.25, 0.39, 0.55, 0.7, 0.86, 1]
};

const variedGlyphs = buildGroup(Array.from({ length: 80 }, randomTrack), {
  tokenId: "23001", speed: "Medium", shift: "UV", gradient: "Linear"
});
const uniformGlyphs = buildGroup(Array.from({ length: 80 }, () => bandTrack), {
  tokenId: "23002", speed: "Medium", shift: "UV", gradient: "Linear"
});

function escapeXml(text) {
  return String(text).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;"
  })[char]);
}

function renderGallery(glyphs, title, subtitle) {
  const columns = 8;
  const rows = 10;
  const tile = 72;
  const outer = 18;
  const header = 54;
  const width = columns * tile + outer * 2;
  const height = rows * tile + outer * 2 + header;
  const cell = 9;
  let body = `<rect width="100%" height="100%" fill="#000000"/>`;
  body += `<text x="${outer}" y="23" fill="#d0d0d0" font-family="monospace" font-size="14">${escapeXml(title)}</text>`;
  body += `<text x="${outer}" y="42" fill="#777777" font-family="monospace" font-size="10">${escapeXml(subtitle)}</text>`;
  body += `<rect x="${outer}" y="${outer + header}" width="${columns * tile}" height="${rows * tile}" fill="#111111"/>`;

  for (let index = 0; index < glyphs.length; index++) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = outer + column * tile;
    const y = outer + header + row * tile;
    body += `<rect x="${x}" y="${y}" width="${tile}" height="${tile}" fill="none" stroke="#202020"/>`;
    const glyphX = x + (tile - 5 * cell) / 2;
    const glyphY = y + (tile - 5 * cell) / 2;
    for (const cellIndex of glyphs[index].visibleIndices) {
      const cellX = cellIndex % 5;
      const cellY = Math.floor(cellIndex / 5);
      const fill = glyphs[index].visibleColorMap[cellIndex] || "#eeeeee";
      body += `<rect x="${glyphX + cellX * cell}" y="${glyphY + cellY * cell}" width="${cell}" height="${cell}" fill="${fill}"/>`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>\n`;
}

await mkdir(auditDir, { recursive: true });
await writeFile(
  join(auditDir, "morphology-gallery.svg"),
  renderGallery(variedGlyphs, "GLYPH ENGINE 2.3 — VARIED TRACKS", "80 deterministic realizations from different chromatic behaviors")
);
await writeFile(
  join(auditDir, "uniform-band-gallery.svg"),
  renderGallery(uniformGlyphs, "GLYPH ENGINE 2.3 — ONE UNIFORM BAND", "one identical chromatic field, resolved through 80 on-chain identities")
);

console.log("Morphology gallery SVGs written.");
