import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const enginePath = join(root, "src/checkglyphs.js");

function parseColor(value) {
  const input = String(value || "").trim().toLowerCase();
  const named = {
    black: "#000000",
    white: "#ffffff",
    red: "#ff0000",
    green: "#008000",
    blue: "#0000ff",
    gray: "#808080",
    grey: "#808080"
  };
  const text = named[input] || input;
  const rgb = text.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (rgb) {
    return {
      r: Math.round(Number(rgb[1])),
      g: Math.round(Number(rgb[2])),
      b: Math.round(Number(rgb[3]))
    };
  }

  const match = text.match(/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (!match) throw new Error(`Unsupported test color: ${value}`);
  let hex = match[1];
  if (hex.length === 3 || hex.length === 4) {
    hex = hex.slice(0, 3).split("").map(char => char + char).join("");
  } else {
    hex = hex.slice(0, 6);
  }
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16)
  };
}

const context = vm.createContext({
  console,
  TextDecoder,
  TextEncoder,
  Uint8Array,
  atob,
  setTimeout,
  clearTimeout,
  max: Math.max,
  min: Math.min,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  abs: Math.abs,
  pow: Math.pow,
  sqrt: Math.sqrt,
  constrain: (value, low, high) => Math.min(high, Math.max(low, value)),
  lerp: (start, stop, amount) => start + (stop - start) * amount,
  color: parseColor,
  red: value => value.r,
  green: value => value.g,
  blue: value => value.b
});

vm.runInContext(await readFile(enginePath, "utf8"), context, { filename: enginePath });
vm.runInContext(`
function __morphologyCheck(input, options = {}) {
  loadedTokenId = String(options.tokenId ?? "1");
  loadedTraits = {
    speed: options.speed ?? "Medium",
    shift: options.shift ?? "UV",
    gradient: options.gradient ?? "Linear",
    all: {}
  };

  const colors = input.colors.slice();
  const keyTimes = input.keyTimes.slice();
  const checkObj = {
    x: 0,
    y: 0,
    sourceX: 0,
    sourceY: 0,
    sourceScale: 1,
    row: 0,
    col: 0,
    colors,
    keyTimes,
    rawColors: colors.slice(),
    rawKeyTimes: keyTimes.slice(),
    initialFill: input.initialFill || colors[0],
    rawOrder: options.rawOrder ?? 0,
    exactSignature: "",
    word: "",
    metrics: null,
    identity: null,
    initialColor: ""
  };

  checkObj.exactSignature = computeExactTrackSignature(checkObj);
  checkObj.word = computeColorWord(checkObj.colors);
  checkObj.metrics = computeMetrics(checkObj);
  checkObj.identity = buildCheckIdentity(checkObj);
  checkObj.initialColor = getInitialCheckColor(checkObj);

  const glyph = buildGlyphData(checkObj, options.collisionAttempt ?? 0);
  return {
    glyph,
    signature: checkObj.exactSignature
  };
}
`, context);

vm.runInContext(`
function __morphologyGroup(input, count = 80, options = {}) {
  loadedTokenId = String(options.tokenId ?? "1");
  loadedTraits = {
    speed: options.speed ?? "Medium",
    shift: options.shift ?? "UV",
    gradient: options.gradient ?? "Linear",
    all: {}
  };
  const used = new Set();
  const out = [];
  for (let rawOrder = 0; rawOrder < count; rawOrder++) {
    const colors = input.colors.slice();
    const keyTimes = input.keyTimes.slice();
    const checkObj = {
      x: rawOrder % 8,
      y: Math.floor(rawOrder / 8),
      sourceX: rawOrder % 8,
      sourceY: Math.floor(rawOrder / 8),
      sourceScale: 1,
      row: Math.floor(rawOrder / 8),
      col: rawOrder % 8,
      colors,
      keyTimes,
      rawColors: colors.slice(),
      rawKeyTimes: keyTimes.slice(),
      initialFill: input.initialFill || colors[0],
      rawOrder,
      exactSignature: "",
      word: "",
      metrics: null,
      identity: null,
      initialColor: ""
    };
    checkObj.exactSignature = computeExactTrackSignature(checkObj);
    checkObj.word = computeColorWord(checkObj.colors);
    checkObj.metrics = computeMetrics(checkObj);
    checkObj.identity = buildCheckIdentity(checkObj);
    checkObj.initialColor = getInitialCheckColor(checkObj);
    const selection = selectGlyphDataWithoutCollision(checkObj, used);
    out.push({ glyph: selection.glyphData, collisionAttempt: selection.collisionAttempt });
  }
  return out;
}
`, context);

function buildGroup(input, count = 80, options = {}) {
  context.__groupInput = input;
  context.__groupCount = count;
  context.__groupOptions = options;
  const result = vm.runInContext("__morphologyGroup(__groupInput, __groupCount, __groupOptions)", context);
  delete context.__groupInput;
  delete context.__groupCount;
  delete context.__groupOptions;
  return JSON.parse(JSON.stringify(result));
}

function build(input, options = {}) {
  context.__input = input;
  context.__options = options;
  const result = vm.runInContext("__morphologyCheck(__input, __options)", context);
  delete context.__input;
  delete context.__options;
  return JSON.parse(JSON.stringify(result));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function hamming(a, b) {
  const A = new Set(a);
  const B = new Set(b);
  let distance = 0;
  for (let index = 0; index < 25; index++) {
    if (A.has(index) !== B.has(index)) distance++;
  }
  return distance;
}

function isolatedCount(indices) {
  const set = new Set(indices);
  let isolated = 0;
  for (const index of indices) {
    const x = index % 5;
    const y = Math.floor(index / 5);
    const neighbors = [];
    if (x > 0) neighbors.push(index - 1);
    if (x < 4) neighbors.push(index + 1);
    if (y > 0) neighbors.push(index - 5);
    if (y < 4) neighbors.push(index + 5);
    if (!neighbors.some(next => set.has(next))) isolated++;
  }
  return isolated;
}

function componentCount(indices) {
  const remaining = new Set(indices);
  let count = 0;
  while (remaining.size) {
    count++;
    const start = remaining.values().next().value;
    remaining.delete(start);
    const stack = [start];
    while (stack.length) {
      const index = stack.pop();
      const x = index % 5;
      const y = Math.floor(index / 5);
      const neighbors = [];
      if (x > 0) neighbors.push(index - 1);
      if (x < 4) neighbors.push(index + 1);
      if (y > 0) neighbors.push(index - 5);
      if (y < 4) neighbors.push(index + 5);
      for (const next of neighbors) {
        if (!remaining.has(next)) continue;
        remaining.delete(next);
        stack.push(next);
      }
    }
  }
  return count;
}

const loopTrack = {
  initialFill: "#ff5c35",
  colors: ["#ff5c35", "#f7d154", "#5ac8fa", "#5856d6", "#ff5c35"],
  keyTimes: [0, 0.2, 0.55, 0.82, 1]
};
const rgbPerturbation = {
  ...loopTrack,
  colors: ["#ff5c35", "#f7d154", "#5ac8fb", "#5856d6", "#ff5c35"]
};
const timingPerturbation = {
  ...loopTrack,
  keyTimes: [0, 0.2, 0.551, 0.82, 1]
};
const turbulentTrack = {
  initialFill: "#0011ff",
  colors: ["#0011ff", "#ff2200", "#00ff77", "#cc00ff", "#ffee00", "#00aaff"],
  keyTimes: [0, 0.06, 0.31, 0.47, 0.86, 1]
};
const monochromeTrack = {
  initialFill: "#f2f2f2",
  colors: ["#f2f2f2"],
  keyTimes: [0]
};

const deterministicA = build(loopTrack, { tokenId: "1", rawOrder: 0, speed: "Slow" });
const deterministicB = build(loopTrack, { tokenId: "1", rawOrder: 0, speed: "Slow" });
assert(JSON.stringify(deterministicA) === JSON.stringify(deterministicB), "Morphology is not deterministic.");

for (const [name, perturbed] of [["RGB", rgbPerturbation], ["timing", timingPerturbation]]) {
  const base = build(loopTrack, { tokenId: "1", rawOrder: 0, speed: "Slow" }).glyph;
  const next = build(perturbed, { tokenId: "1", rawOrder: 0, speed: "Slow" }).glyph;
  assert(base.profile.fieldFamily === next.profile.fieldFamily, `${name} perturbation changed the chromatic field.`);
  assert(hamming(base.visibleIndices, next.visibleIndices) <= 2, `${name} perturbation changed too many cells.`);
}

for (const track of [loopTrack, rgbPerturbation, timingPerturbation, turbulentTrack, monochromeTrack]) {
  for (let attempt = 0; attempt < 18; attempt++) {
    const glyph = build(track, { tokenId: "73", rawOrder: 4, collisionAttempt: attempt }).glyph;
    assert(glyph.visibleIndices.length >= 2, "A glyph contains fewer than two visible cells.");
    assert(glyph.visibleIndices.length <= 12, "A glyph exceeds the lexical density ceiling.");
    assert(componentCount(glyph.visibleIndices) <= 3, "A glyph exceeds the component ceiling.");
    assert(isolatedCount(glyph.visibleIndices) <= 2, "A glyph contains too many isolated accents.");
    assert(glyph.profile.fieldFamily, "A glyph is missing its chromatic field family.");
    assert(glyph.profile.targetCount >= 2, "A glyph is missing a valid target count.");
  }
}

const identityA = build(loopTrack, { tokenId: "1", rawOrder: 0, speed: "Slow" }).glyph;
const identityB = build(loopTrack, { tokenId: "999", rawOrder: 37, speed: "Slow" }).glyph;
assert(identityA.profile.behaviorKey === identityB.profile.behaviorKey, "Identity changed the chromatic behavior descriptor.");
assert(identityA.profile.fieldFamily === identityB.profile.fieldFamily, "Identity changed the chromatic field.");

const uniformBand = buildGroup(loopTrack, 80, { tokenId: "7777", speed: "Medium", shift: "UV", gradient: "Linear" });
const uniformShapes = uniformBand.map(item => item.glyph.visibleIndices.join(","));
const uniformFamilies = new Set(uniformBand.map(item => item.glyph.profile.family));
const uniformCounts = uniformBand.map(item => item.glyph.visibleIndices.length);
assert(new Set(uniformShapes).size >= 72, "A uniform chromatic band does not generate enough distinct realizations.");
assert(uniformFamilies.size >= 4, "A uniform chromatic band collapsed into too few admissible families.");
assert(uniformCounts.filter(count => count <= 4).length >= 3, "A uniform chromatic band does not retain enough minimal glyphs.");
assert(uniformCounts.filter(count => count >= 8).length >= 8, "A uniform chromatic band does not retain a broad density range.");
assert(uniformBand.every(item => item.collisionAttempt <= 18), "Collision control exceeded its deterministic bound.");

const monochrome = build(monochromeTrack, { tokenId: "7777", rawOrder: 0 }).glyph;
assert(monochrome.profile.fieldFamily === "bar", "A still chromatic signal should anchor the elemental bar field.");

const unrelatedA = build(monochromeTrack, { tokenId: "1", rawOrder: 0 }).glyph;
const unrelatedB = build(turbulentTrack, { tokenId: "1", rawOrder: 0, speed: "Fast", gradient: "Noise" }).glyph;
assert(unrelatedA.profile.fieldFamily !== unrelatedB.profile.fieldFamily, "Distinct chromatic behaviors collapsed to the same field.");
assert(hamming(unrelatedA.visibleIndices, unrelatedB.visibleIndices) >= 4, "Distinct chromatic behaviors are insufficiently differentiated.");

console.log("Morphology field invariants passed.");
