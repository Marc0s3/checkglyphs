import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const enginePath = resolve(process.env.CHECKGLYPHS_ENGINE || join(root, "src/checkglyphs.js"));
const fixturesDir = join(root, "tests/fixtures");
const expectedDir = join(root, "tests/expected");
const update = process.env.UPDATE_SNAPSHOTS === "1";

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

  const rgbMatch = text.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (rgbMatch) {
    return {
      r: Math.round(Number(rgbMatch[1])),
      g: Math.round(Number(rgbMatch[2])),
      b: Math.round(Number(rgbMatch[3]))
    };
  }

  const hexMatch = text.match(/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (!hexMatch) throw new Error(`Unsupported test color: ${value}`);

  let hex = hexMatch[1];
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

function createContext() {
  const context = {
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
  };

  return vm.createContext(context);
}

const helperSource = `
function __buildRegressionFixture(fixture) {
  loadedTokenId = String(fixture.tokenId);
  loadedName = "checks-token-" + loadedTokenId + ".svg";
  loadedTraits = {
    speed: fixture.traits.speed,
    shift: fixture.traits.shift,
    gradient: fixture.traits.gradient,
    all: {}
  };

  const usedShapeSignatures = new Set();
  const results = [];
  const fixtureChecks = Array.isArray(fixture.checks)
    ? fixture.checks
    : Array.from({ length: fixture.repeat || 0 }, (_, index) => ({
        ...fixture.check,
        x: (index % (fixture.columns || 8)) * 36,
        y: Math.floor(index / (fixture.columns || 8)) * 36
      }));

  fixtureChecks.forEach((input, rawOrder) => {
    const colors = input.colors.slice();
    const keyTimes = input.keyTimes.slice();
    const checkObj = {
      x: input.x,
      y: input.y,
      sourceX: input.x,
      sourceY: input.y,
      sourceScale: input.scale,
      row: 0,
      col: 0,
      colors,
      keyTimes,
      rawColors: colors.slice(),
      rawKeyTimes: keyTimes.slice(),
      initialFill: input.initialFill,
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

    const selection = selectGlyphDataWithoutCollision(
      checkObj,
      usedShapeSignatures
    );
    const glyphData = selection.glyphData;
    const orderedColorMap = {};

    Object.keys(glyphData.visibleColorMap)
      .map(Number)
      .sort((a, b) => a - b)
      .forEach(index => {
        orderedColorMap[index] = glyphData.visibleColorMap[index];
      });

    results.push({
      rawOrder,
      exactSignature: checkObj.exactSignature,
      metrics: checkObj.metrics,
      identity: checkObj.identity,
      visibleIndices: glyphData.visibleIndices,
      hiddenIndices: glyphData.hiddenIndices,
      visibleColorMap: orderedColorMap,
      familyId: glyphData.familyId,
      inflectionId: glyphData.inflectionId,
      profile: glyphData.profile,
      dna: glyphData.dna,
      originIndex: glyphData.originIndex,
      traversal: glyphData.traversal,
      collisionAttempt: selection.collisionAttempt
    });
  });

  return results;
}

function __utilityRegressionSnapshot() {
  const encoded = "hello CheckGlyphs";
  const hex = Array.from(new TextEncoder().encode(encoded))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
  const paddedLength = encoded.length.toString(16).padStart(64, "0");
  const abi = "0x" + "20".padStart(64, "0") + paddedLength + hex.padEnd(64, "0");

  return {
    token1CallData: buildTokenURIEthCallData("1"),
    token4096CallData: buildTokenURIEthCallData("4096"),
    svgSignatureHex: utf8ToRpcHex("svg(uint256)"),
    historicalSvgAccepted: isRevealedChecksSVG('<svg><use href="#check"><animate attributeName="fill" values="#fff;#000"/></use></svg>'),
    unrevealedSvgRejected: isRevealedChecksSVG('<svg><use href="#check" fill="#424242"/></svg>'),
    decodedAbi: decodeAbiString(abi),
    decodedTextDataUri: decodeDataURIToText("data:text/plain,hello%20glyphs"),
    decodedBase64DataUri: decodeDataURIToText("data:text/plain;base64,aGVsbG8gZ2x5cGhz"),
    ipfsUrl: normalizeFetchURL("ipfs://QmExample/file.json"),
    arweaveUrl: normalizeFetchURL("ar://ExampleTx")
  };
}
`;

const source = await readFile(enginePath, "utf8");
const context = createContext();
vm.runInContext(source, context, { filename: enginePath });
vm.runInContext(helperSource, context, { filename: "regression-helper.js" });

const fixtureFiles = (await readdir(fixturesDir))
  .filter(name => name.endsWith(".json"))
  .sort();

let failures = 0;

for (const fixtureFile of fixtureFiles) {
  const fixture = JSON.parse(await readFile(join(fixturesDir, fixtureFile), "utf8"));
  context.__fixture = fixture;
  const snapshot = vm.runInContext("__buildRegressionFixture(__fixture)", context);
  delete context.__fixture;

  const serialized = JSON.stringify(snapshot);
  const summarizeGlyph = item => ({
    familyId: item.familyId,
    visibleIndices: item.visibleIndices,
    traversal: item.traversal,
    originIndex: item.originIndex,
    collisionAttempt: item.collisionAttempt
  });

  const summary = {
    fixture: fixture.name,
    checkCount: snapshot.length,
    sha256: createHash("sha256").update(serialized).digest("hex"),
    collisionAttempts: snapshot.map(item => item.collisionAttempt),
    firstGlyph: summarizeGlyph(snapshot[0]),
    lastGlyph: summarizeGlyph(snapshot[snapshot.length - 1])
  };

  const expectedPath = join(expectedDir, fixtureFile);

  if (update) {
    await writeFile(expectedPath, JSON.stringify(summary, null, 2) + "\n");
    console.log(`Updated ${basename(expectedPath)}`);
    continue;
  }

  const expected = JSON.parse(await readFile(expectedPath, "utf8"));
  if (JSON.stringify(summary) !== JSON.stringify(expected)) {
    failures++;
    console.error(`Regression mismatch: ${fixture.name}`);
    console.error(`Expected SHA-256: ${expected.sha256}`);
    console.error(`Actual SHA-256:   ${summary.sha256}`);
  } else {
    console.log(`Regression passed: ${fixture.name}`);
  }
}

const utilitySnapshot = vm.runInContext("__utilityRegressionSnapshot()", context);
const expectedUtilities = {
  token1CallData: "0xc87b56dd" + "1".padStart(64, "0"),
  token4096CallData: "0xc87b56dd" + "1000".padStart(64, "0"),
  svgSignatureHex: "0x7376672875696e7432353629",
  historicalSvgAccepted: true,
  unrevealedSvgRejected: false,
  decodedAbi: "hello CheckGlyphs",
  decodedTextDataUri: "hello glyphs",
  decodedBase64DataUri: "hello glyphs",
  ipfsUrl: "https://ipfs.io/ipfs/QmExample/file.json",
  arweaveUrl: "https://arweave.net/ExampleTx"
};

if (JSON.stringify(utilitySnapshot) !== JSON.stringify(expectedUtilities)) {
  failures++;
  console.error("Loader utility regression mismatch.");
  console.error({ expectedUtilities, utilitySnapshot });
} else {
  console.log("Loader utility regression passed.");
}

if (failures) process.exit(1);
console.log("All deterministic regression tests passed.");
