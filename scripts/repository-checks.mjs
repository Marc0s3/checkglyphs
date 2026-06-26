import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = path => readFile(resolve(root, path), "utf8");

const requiredFiles = [
  "LICENSE",
  "THIRD_PARTY_NOTICES.md",
  "README.md",
  "CHANGELOG.md",
  "index.html",
  "styles.css",
  "src/checkglyphs.js",
  "assets/empty-placeholder.svg",
  "scripts/morphology-tests.mjs",
  "scripts/morphology-audit.mjs",
  "scripts/morphology-gallery.mjs",
  "audit/MORPHOLOGY_AUDIT_2.3.md",
  "audit/morphology-audit-results.json",
  "audit/morphology-gallery.svg",
  "audit/morphology-gallery.png",
  "audit/uniform-band-gallery.svg",
  "audit/uniform-band-gallery.png"
];

await Promise.all(requiredFiles.map(path => access(resolve(root, path))));

const [html, engine, license, readme, changelog, packageText] =
  await Promise.all([
    read("index.html"),
    read("src/checkglyphs.js"),
    read("LICENSE"),
    read("README.md"),
    read("CHANGELOG.md"),
    read("package.json")
  ]);

const packageJson = JSON.parse(packageText);

const requiredHtmlIds = [
  "tokenInput",
  "generateBtn",
  "saveBtn",
  "saveSvgBtn",
  "statusLine",
  "canvas-holder",
  "sourceImage",
  "glyphPreviewImage",
  "transductionWorkspace",
  "pathToggle",
  "chromaticPathRows",
  "pathModeStepsBtn",
  "pathModeBandBtn",
  "metaSpeedItem",
  "metaShiftItem"
];

for (const id of requiredHtmlIds) {
  if (!html.includes(`id="${id}"`)) throw new Error(`Missing HTML control: ${id}`);
}

for (const requiredCopy of [
  "FROM CHROMATIC BEHAVIOR",
  "TO VISUAL LANGUAGE.",
  "TRANSDUCE",
  "SOURCE",
  "OUTPUT",
  "GLYPH FOR CHECKS #—",
  "READING WHAT EXISTS BEFORE THE IMAGE.",
  "WITH GRATITUDE TO",
  "VISUALIZE VALUE",
  "MIT LICENSE · 2026"
]) {
  if (!html.includes(requiredCopy)) {
    throw new Error(`Missing public interface copy: ${requiredCopy}`);
  }
}

for (const obsoleteCopy of [
  "Generate",
  "Save PNG",
  "Keyboard:",
  "VIEW CHROMATIC PATHS",
  "CHECKGLYPHS #—",
  "EXPORT GLYPHS",
  "content: \"PATH\"",
  "process-arrow",
  "<b>→</b>"
]) {
  if (html.includes(obsoleteCopy)) {
    throw new Error(`Obsolete interface copy is still present: ${obsoleteCopy}`);
  }
}

for (const removed of ["rpcInput", "svgInput", "Custom Ethereum RPC", "Load SVG"]) {
  if (html.includes(removed) || engine.includes(removed)) {
    throw new Error(`Removed public feature is still present: ${removed}`);
  }
}

for (const endpoint of [
  "https://ethereum-rpc.publicnode.com",
  "https://ethereum.publicnode.com",
  "https://eth.drpc.org",
  "https://public.1rpc.io/eth",
  "https://ethereum.public.blockpi.network/v1/rpc/public"
]) {
  if (!engine.includes(endpoint)) throw new Error(`Missing internal RPC endpoint: ${endpoint}`);
}

for (const requiredEngineFeature of [
  "fetchHistoricalSVGFromContract",
  "isRevealedChecksSVG",
  "SVG_FUNCTION_SIGNATURE",
  "NO MIGRATED OR HISTORICAL CHECKS ORIGINAL FOUND",
  "CHECKGLYPHS — GLYPH ENGINE 2.3",
  "13 overlapping morphological fields",
  "chromatic morphology field + identity-resolved realization",
  "FOUR-CELL CHECK GLYPH",
  "5×5 = 25 possible cells"
]) {
  if (!engine.includes(requiredEngineFeature)) {
    throw new Error(`Missing engine feature or documentation: ${requiredEngineFeature}`);
  }
}

if (engine.includes("// KEYS:")) {
  throw new Error("Obsolete keyboard documentation is still present in the engine header.");
}

for (const licenseCopy of [
  "MIT License",
  "Copyright (c) 2026 Marc0s",
  "Permission is hereby granted, free of charge"
]) {
  if (!license.includes(licenseCopy)) {
    throw new Error(`Missing license text or notice: ${licenseCopy}`);
  }
}

if (packageJson.version !== "2.6.0") {
  throw new Error(`Unexpected package version: ${packageJson.version}`);
}

if (packageJson.license !== "MIT") {
  throw new Error(`Unexpected package license: ${packageJson.license}`);
}

if (!readme.includes("Release **2.6.0**") || !readme.includes("13 overlapping morphological fields")) {
  throw new Error("README status or engine explanation is incomplete.");
}


for (const staleLicenseCopy of [
  "PolyForm-Noncommercial-1.0.0",
  "POLYFORM NONCOMMERCIAL 1.0.0",
  "source-available for noncommercial use",
  "COMMERCIAL-LICENSING.md"
]) {
  if (html.includes(staleLicenseCopy) || engine.includes(staleLicenseCopy) || readme.includes(staleLicenseCopy) || packageText.includes(staleLicenseCopy)) {
    throw new Error(`Stale noncommercial licensing reference remains: ${staleLicenseCopy}`);
  }
}

if (!changelog.includes("## 2.6.0") || !changelog.includes("## 2.5.0") || !changelog.includes("## 2.1.0") || !changelog.includes("## 2.1.1")) {
  throw new Error("Archived changelog history is incomplete.");
}

console.log("Repository checks passed.");
