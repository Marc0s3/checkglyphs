// CHECKGLYPHS — GLYPH ENGINE 2.3
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Marc0s
// Deterministic chromatic transduction for Checks SVGs.
//
// ABSTRACT
// Each animated Check is treated as a time-indexed chromatic signal C(t),
// normalized over t ∈ [0,1]. SVG color values and keyTimes reconstruct that
// signal. Its temporal distribution, perceptual variation, closure, roughness,
// peaks, luminance drift, timing and global token traits are transduced into a
// 5×5 discrete glyph. Stable on-chain identity resolves one admissible form
// inside the chromatic morphology field. No runtime randomness is used.
//
// PIPELINE
// token ID → on-chain or historical SVG → Check instances → C(t) + keyTimes
// → 25-sample CIELAB behavior descriptor → causal morphological profile
// → chromatic morphology field + identity-resolved realization → temporal recoloring
// → vector SVG preview and PNG/SVG export
//
// MORPHOLOGICAL MODEL
// - lattice: 5×5 = 25 possible cells
// - vocabulary: 13 overlapping morphological fields, each anchored in explicit
//   chromatic descriptors and populated by a broad epigraphic archetype grammar
// - profile: chromatic behavior defines an admissible field (families, density
//   envelope, symmetry tendency, topology); identity selects one realization
// - construction: field → archetype → transform → density → accents → validation
// - identity: contract/token ID + local Check index select within the field; they
//   cannot leave its admissible family, density, or topology neighborhood
// - collision control: retries select another admissible realization, never a
//   shape from an unrelated chromatic field
//
// CHROMATIC INVARIANTS
// - the first visible row-major cell is the recognition anchor
// - that anchor receives the exact source color at t=0
// - the remaining visible cells sample C(t) at evenly spaced normalized times
// - traversal prefers orthogonal continuity; intentional accents may require jumps
// - cells outside the morphology remain transparent and are not rendered
//
// FOUR-CELL CHECK GLYPH — schematic example
//
// · · · · ■
// · · · ■ ·
// ■ · ■ · ·
// · · · · ·
// · · · · ·
//
// DETERMINISM SCOPE
// Given the same contract state, token ID, source SVG, engine version, schema,
// and ordered internal vocabularies, the same glyph data is produced. The
// monolithic engine is intentionally preserved because descriptor thresholds,
// seed strings, array order, and transformation order are output-significant.
// Refactor only against the frozen regression fixtures.
//
// OUTPUT
// - interactive source SVG
// - static vector glyph preview
// - PNG and SVG exports
// - DNA record: schema 2.3 / engine 2.3

let tokenIdInput;
let loadTokenButton;
let statusLine;

let checks = [];
let svgLayout = null;
let renderBox = null;

let loadedTokenId = "";
let loadedTraits = {
  speed: "unknown",
  shift: "unknown",
  gradient: "unknown",
  all: {}
};

let htmlUI = null;
let sourceSvgObjectUrl = "";
let glyphPreviewObjectUrl = "";
let chromaticPathMode = "steps";
let loadedSourceState = "active";
let svgFunctionSelector = "";

// ----------------------------------
// CONTRACT / RPC CONFIG
// ----------------------------------

const CHECKS_CONTRACT = "0x036721e5A769Cc48B3189EFbb9ccE4471E8A48B1";
const TOKEN_URI_SELECTOR = "0xc87b56dd"; // tokenURI(uint256)
const SVG_FUNCTION_SIGNATURE = "svg(uint256)";

const DEFAULT_RPC_ENDPOINTS = [
  "https://ethereum-rpc.publicnode.com",
  "https://ethereum.publicnode.com",
  "https://eth.drpc.org",
  "https://public.1rpc.io/eth",
  "https://ethereum.public.blockpi.network/v1/rpc/public"
];

// ----------------------------------
// CONFIG
// ----------------------------------

const EXPORT_SCALE = 4;
const SVG_DISPLAY_SCALE = 2;

const FALLBACK_ROOT_W = 680;
const FALLBACK_ROOT_H = 680;
const FALLBACK_PANEL = { x: 188, y: 152, w: 304, h: 376 };

const GLYPH_N = 5;
const GLYPH_CELLS = GLYPH_N * GLYPH_N;
const CHECKGLYPHS_SCHEMA_VERSION = "2.3";
const GLYPH_ENGINE_VERSION = "2.3";
const CHROMATIC_ORIGIN_POLICY = "first-visible-row-major";
const MAX_GLYPH_COLLISION_ATTEMPTS = 18;


// Engine 2.3 does not treat an archetype as a finished glyph. These compact,
// epigraphic primitives are seeds for a behavior-bounded realization process.
// Sparse signs, broken bars, paired modules, gates, forks, chambers and accents
// deliberately coexist. Transforms, density fitting and controlled topology
// multiply this bank into a much larger vocabulary without adding randomness.
const GLYPH_ARCHETYPES_V23 = Object.freeze({
  dot: [[2, 2]],
  pairH: [[1, 2], [3, 2]],
  pairV: [[2, 1], [2, 3]],
  pairDiag: [[1, 1], [3, 3]],
  dash3: [[1, 2], [2, 2], [3, 2]],
  stem3: [[2, 1], [2, 2], [2, 3]],
  brokenDash: [[0, 2], [1, 2], [3, 2], [4, 2]],
  brokenStem: [[2, 0], [2, 1], [2, 3], [2, 4]],
  doubleDash: [[1, 1], [2, 1], [3, 1], [1, 3], [2, 3], [3, 3]],
  doubleStem: [[1, 1], [1, 2], [1, 3], [3, 1], [3, 2], [3, 3]],
  fourDots: [[1, 1], [3, 1], [1, 3], [3, 3]],
  tee4: [[1, 1], [2, 1], [3, 1], [2, 2]],
  tee5: [[1, 1], [2, 1], [3, 1], [2, 2], [2, 3]],
  cross5: [[2, 0], [2, 1], [1, 2], [2, 2], [3, 2]],
  cross9: [[2, 0], [2, 1], [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [2, 3], [2, 4]],
  ell3: [[1, 1], [1, 2], [2, 2]],
  ell5: [[1, 0], [1, 1], [1, 2], [2, 2], [3, 2]],
  cornerPair: [[1, 1], [1, 2], [3, 2], [3, 3]],
  stair4: [[1, 0], [1, 1], [2, 1], [2, 2]],
  stair6: [[0, 1], [1, 1], [1, 2], [2, 2], [2, 3], [3, 3]],
  zigzag5: [[0, 1], [1, 1], [1, 2], [2, 2], [3, 2]],
  zigzag7: [[0, 1], [1, 1], [1, 2], [2, 2], [3, 2], [3, 3], [4, 3]],
  fork4: [[1, 1], [3, 1], [2, 2], [2, 3]],
  fork6: [[0, 1], [1, 1], [3, 1], [4, 1], [2, 2], [2, 3]],
  trident7: [[0, 1], [2, 1], [4, 1], [1, 2], [2, 2], [3, 2], [2, 3]],
  arch5: [[1, 1], [2, 1], [3, 1], [1, 2], [3, 2]],
  gate7: [[1, 1], [2, 1], [3, 1], [1, 2], [3, 2], [1, 3], [3, 3]],
  cup5: [[1, 1], [1, 2], [1, 3], [2, 3], [3, 3]],
  cup7: [[1, 1], [3, 1], [1, 2], [3, 2], [1, 3], [2, 3], [3, 3]],
  bracket5: [[1, 1], [1, 2], [1, 3], [3, 1], [3, 3]],
  h5: [[1, 1], [3, 1], [1, 2], [2, 2], [3, 2]],
  h7: [[1, 1], [3, 1], [1, 2], [2, 2], [3, 2], [1, 3], [3, 3]],
  crown5: [[1, 1], [3, 1], [1, 2], [2, 2], [3, 2]],
  crown7: [[0, 1], [2, 1], [4, 1], [1, 2], [2, 2], [3, 2], [2, 3]],
  altar6: [[2, 0], [2, 1], [1, 2], [2, 2], [3, 2], [2, 3]],
  pedestal7: [[2, 0], [2, 1], [2, 2], [0, 3], [1, 3], [2, 3], [3, 3]],
  eyes3: [[1, 1], [3, 1], [2, 3]],
  eyes5: [[1, 1], [3, 1], [1, 3], [2, 3], [3, 3]],
  mask6: [[1, 1], [3, 1], [0, 2], [2, 2], [4, 2], [2, 3]],
  ring8: [[1, 1], [2, 1], [3, 1], [1, 2], [3, 2], [1, 3], [2, 3], [3, 3]],
  chamber9: [[0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [0, 2], [4, 2], [1, 3], [3, 3]],
  satellite4: [[2, 0], [0, 2], [4, 2], [2, 4]],
  satellite5: [[2, 0], [0, 2], [2, 2], [4, 2], [2, 4]],
  splitGate6: [[0, 1], [1, 1], [3, 1], [4, 1], [1, 3], [3, 3]],
  hooked5: [[1, 0], [1, 1], [1, 2], [2, 2], [2, 3]],
  rune6: [[1, 0], [1, 1], [2, 1], [2, 2], [3, 2], [3, 3]],
  rune8: [[0, 1], [1, 1], [2, 1], [2, 2], [2, 3], [3, 3], [4, 3], [4, 4]],
  weave8: [[0, 2], [1, 2], [1, 1], [2, 1], [2, 3], [3, 3], [3, 2], [4, 2]],
  block4: [[1, 1], [2, 1], [1, 2], [2, 2]],
  block6: [[1, 1], [2, 1], [3, 1], [1, 2], [2, 2], [3, 2]]
});

const GLYPH_FAMILY_ARCHETYPE_POOL_V23 = Object.freeze({
  bar: ["pairH", "pairV", "dash3", "stem3", "brokenDash", "brokenStem", "doubleDash", "fourDots", "tee4", "cross5", "satellite4", "block4"],
  monolith: ["stem3", "brokenStem", "tee4", "tee5", "cross5", "altar6", "pedestal7", "doubleStem", "hooked5", "block4"],
  gate: ["arch5", "gate7", "cup5", "cup7", "bracket5", "splitGate6", "h5", "h7", "ring8", "eyes5"],
  mask: ["eyes3", "eyes5", "mask6", "crown5", "crown7", "h5", "h7", "ring8", "satellite5", "fourDots"],
  fork: ["fork4", "fork6", "trident7", "tee4", "tee5", "crown5", "crown7", "cross5", "zigzag5", "eyes3"],
  altar: ["tee4", "tee5", "altar6", "pedestal7", "crown5", "crown7", "cross5", "cup5", "brokenStem", "block6"],
  knot: ["cross5", "cross9", "h7", "ring8", "satellite5", "weave8", "block6", "mask6", "crown7", "trident7"],
  stair: ["ell3", "ell5", "stair4", "stair6", "zigzag5", "zigzag7", "hooked5", "rune6", "cornerPair", "brokenDash"],
  chamber: ["arch5", "gate7", "cup7", "ring8", "chamber9", "bracket5", "splitGate6", "h7", "block6", "eyes5"],
  scatter: ["dot", "pairH", "pairV", "pairDiag", "fourDots", "satellite4", "satellite5", "eyes3", "brokenDash", "cornerPair"],
  emblem: ["cross5", "tee4", "h5", "crown5", "eyes3", "satellite5", "block4", "fork4", "arch5", "fourDots"],
  rune: ["ell3", "ell5", "hooked5", "rune6", "rune8", "zigzag5", "zigzag7", "stair4", "cornerPair", "fork4"],
  composite: ["brokenDash", "doubleDash", "cornerPair", "zigzag7", "fork6", "mask6", "weave8", "satellite5", "splitGate6", "rune8", "crown7", "chamber9"]
});

const GLYPH_FAMILY_FIELD_V23 = Object.freeze({
  bar: ["bar", "bar", "bar", "monolith", "emblem", "scatter", "gate", "rune"],
  monolith: ["monolith", "monolith", "bar", "altar", "emblem", "rune"],
  gate: ["gate", "gate", "chamber", "mask", "emblem", "bar"],
  mask: ["mask", "mask", "gate", "chamber", "emblem", "knot", "scatter"],
  fork: ["fork", "fork", "altar", "rune", "stair", "emblem"],
  altar: ["altar", "altar", "fork", "monolith", "emblem", "gate"],
  knot: ["knot", "knot", "chamber", "mask", "composite", "emblem"],
  stair: ["stair", "stair", "rune", "bar", "fork", "composite"],
  chamber: ["chamber", "chamber", "gate", "mask", "knot", "emblem"],
  scatter: ["scatter", "scatter", "bar", "rune", "mask", "composite"],
  emblem: ["emblem", "emblem", "bar", "gate", "mask", "altar", "fork"],
  rune: ["rune", "rune", "stair", "fork", "scatter", "composite"],
  composite: ["composite", "composite", "rune", "scatter", "knot", "fork", "stair"]
});

const SVG_CHECK_SIZE = 36;
const CHECKS_INNER_MARGIN = 8;

const USE_EXACT_SVG_CHECK_LAYOUT = true;

const CELL_GAP_FRAC = 0;
const TILE_PAD_FRAC = 0.135;

const OUTER_BG = "#000000";
const CHECKS_PANEL_BG = "#111111";
const CHECKS_GRID = "#191919";

const BG_GRID_COLS = 8;
const BG_GRID_ROWS = 10;

const FILTER_NEAR_BLACK_FROM_COLOR_SAMPLES = true;
const NEAR_BLACK_LUMA_CUTOFF = 38;

// ----------------------------------
// SETUP
// ----------------------------------

function setup() {
  const canvas = createCanvas(
    FALLBACK_ROOT_W * EXPORT_SCALE,
    FALLBACK_ROOT_H * EXPORT_SCALE
  );

  const holder = document.getElementById("canvas-holder");

  if (holder) {
    canvas.parent("canvas-holder");
  }

  pixelDensity(1);
  colorMode(RGB, 255, 255, 255, 255);

  buildUI();

  noLoop();
  drawEmptyState();
}

function draw() {
  if (!checks.length || !renderBox) {
    drawEmptyState();
    return;
  }

  drawPixelCodex();
}

function buildUI() {
  const htmlTokenInput = document.getElementById("tokenInput");
  const htmlGenerateBtn = document.getElementById("generateBtn");
  const htmlSaveBtn = document.getElementById("saveBtn");
  const htmlSaveSvgBtn = document.getElementById("saveSvgBtn");
  const htmlStatusLine = document.getElementById("statusLine");

  const hasHtmlGui = Boolean(
    htmlTokenInput &&
    htmlGenerateBtn &&
    htmlSaveBtn &&
    htmlSaveSvgBtn &&
    htmlStatusLine
  );

  if (hasHtmlGui) {
    buildHtmlUI({
      htmlTokenInput,
      htmlGenerateBtn,
      htmlSaveBtn,
      htmlSaveSvgBtn,
      htmlStatusLine,
      workspace: document.getElementById("transductionWorkspace"),
      sourceImage: document.getElementById("sourceImage"),
      sourcePlaceholder: document.getElementById("sourcePlaceholder"),
      sourceTitle: document.getElementById("sourceTitle"),
      glyphTitle: document.getElementById("glyphTitle"),
      glyphPreviewImage: document.getElementById("glyphPreviewImage"),
      canvasHolder: document.getElementById("canvas-holder"),
      resultDetails: document.getElementById("resultDetails"),
      pathToggle: document.getElementById("pathToggle"),
      chromaticPathPanel: document.getElementById("chromaticPathPanel"),
      chromaticPathRows: document.getElementById("chromaticPathRows"),
      pathCount: document.getElementById("pathCount"),
      pathModeStepsBtn: document.getElementById("pathModeStepsBtn"),
      pathModeBandBtn: document.getElementById("pathModeBandBtn"),
      metaToken: document.getElementById("metaToken"),
      metaChecks: document.getElementById("metaChecks"),
      metaSpeed: document.getElementById("metaSpeed"),
      metaSpeedItem: document.getElementById("metaSpeedItem"),
      metaShift: document.getElementById("metaShift"),
      metaShiftItem: document.getElementById("metaShiftItem"),
      metaGradient: document.getElementById("metaGradient"),
      metaGradientItem: document.getElementById("metaGradientItem")
    });
  } else {
    buildP5FallbackUI();
  }

  setStatus("ENTER A CHECKS TOKEN ID.");
  setTransductionStage("idle");
}

function buildHtmlUI(gui) {
  htmlUI = gui;
  tokenIdInput = {
    value: () => gui.htmlTokenInput.value
  };
  statusLine = gui.htmlStatusLine;

  const loadCurrentToken = () => {
    const tokenId = String(gui.htmlTokenInput.value || "").trim();
    loadCheckFromTokenId(tokenId);
  };

  gui.htmlGenerateBtn.addEventListener("click", loadCurrentToken);
  gui.htmlTokenInput.addEventListener("keydown", event => {
    if (event.key === "Enter") loadCurrentToken();
  });
  gui.htmlSaveBtn.addEventListener("click", saveCurrentGlyphs);
  if (gui.htmlSaveSvgBtn) gui.htmlSaveSvgBtn.addEventListener("click", saveCurrentGlyphsSVG);

  if (gui.pathModeStepsBtn) {
    gui.pathModeStepsBtn.addEventListener("click", () => {
      setChromaticPathMode("steps", true);
    });
  }

  if (gui.pathModeBandBtn) {
    gui.pathModeBandBtn.addEventListener("click", () => {
      setChromaticPathMode("band", true);
    });
  }

  if (gui.pathToggle && gui.chromaticPathPanel) {
    gui.pathToggle.addEventListener("click", () => {
      const willOpen = gui.chromaticPathPanel.hidden;
      gui.chromaticPathPanel.hidden = !willOpen;
      gui.pathToggle.setAttribute("aria-expanded", String(willOpen));
      gui.pathToggle.textContent = chromaticPathActionLabel(willOpen);
    });
  }
}

function chromaticPathActionLabel(isOpen) {
  const noun = checks.length === 1 ? "PATH" : "PATHS";
  return (isOpen ? "HIDE CHROMATIC " : "REVEAL CHROMATIC ") + noun;
}

function setChromaticPathMode(mode, rerender = false) {
  chromaticPathMode = mode === "band" ? "band" : "steps";
  syncChromaticPathModeUI();
  if (rerender && htmlUI?.chromaticPathRows && checks.length) renderChromaticPaths();
}

function syncChromaticPathModeUI() {
  if (htmlUI?.pathModeStepsBtn) {
    const active = chromaticPathMode === "steps";
    htmlUI.pathModeStepsBtn.classList.toggle("is-active", active);
    htmlUI.pathModeStepsBtn.setAttribute("aria-pressed", String(active));
  }

  if (htmlUI?.pathModeBandBtn) {
    const active = chromaticPathMode === "band";
    htmlUI.pathModeBandBtn.classList.toggle("is-active", active);
    htmlUI.pathModeBandBtn.setAttribute("aria-pressed", String(active));
  }
}

function buildP5FallbackUI() {
  tokenIdInput = createInput("");
  tokenIdInput.position(20, 20);
  tokenIdInput.size(110, 22);
  tokenIdInput.attribute("placeholder", "Token ID");

  loadTokenButton = createButton("LOAD TOKEN");
  loadTokenButton.position(140, 20);
  loadTokenButton.mousePressed(() => {
    loadCheckFromTokenId(tokenIdInput.value().trim());
  });

  statusLine = createDiv("");
  statusLine.position(20, 50);
  statusLine.style("font-family", "monospace");
  statusLine.style("font-size", "12px");
  statusLine.style("color", "#999999");
}

function setStatus(msg) {
  const text = String(msg || "");

  if (!statusLine) {
    console.log(text);
    return;
  }

  if (statusLine.elt) {
    statusLine.elt.textContent = text;
    return;
  }

  statusLine.textContent = text;
}

function setStatusTone(tone) {
  if (!htmlUI || !htmlUI.htmlStatusLine) return;

  if (tone) {
    htmlUI.htmlStatusLine.dataset.tone = tone;
  } else {
    delete htmlUI.htmlStatusLine.dataset.tone;
  }
}

function setLoadingState(isLoading) {
  if (!htmlUI) return;

  htmlUI.htmlGenerateBtn.disabled = Boolean(isLoading);
  htmlUI.htmlTokenInput.disabled = Boolean(isLoading);
  if (htmlUI.htmlSaveBtn) htmlUI.htmlSaveBtn.disabled = Boolean(isLoading);
  if (htmlUI.htmlSaveSvgBtn) htmlUI.htmlSaveSvgBtn.disabled = Boolean(isLoading);
  htmlUI.htmlGenerateBtn.textContent = isLoading ? "READING..." : "TRANSDUCE";

  if (htmlUI.workspace) {
    htmlUI.workspace.setAttribute("aria-busy", String(Boolean(isLoading)));
  }
}

function setTransductionStage(stage) {
  if (!htmlUI || !htmlUI.workspace) return;

  const order = ["reading", "extracting", "rendering"];
  const stageIndex = order.indexOf(stage);
  htmlUI.workspace.dataset.state = stage === "complete" ? "complete" : stage;

  htmlUI.workspace.querySelectorAll("[data-stage]").forEach(item => {
    const itemIndex = order.indexOf(item.dataset.stage);
    item.classList.remove("is-active", "is-done");

    if (stage === "complete") {
      item.classList.add("is-done");
    } else if (itemIndex >= 0 && stageIndex >= 0) {
      if (itemIndex < stageIndex) item.classList.add("is-done");
      if (itemIndex === stageIndex) item.classList.add("is-active");
    }
  });
}

function releaseSourceSVG() {
  if (sourceSvgObjectUrl) {
    URL.revokeObjectURL(sourceSvgObjectUrl);
    sourceSvgObjectUrl = "";
  }
}

function releaseGlyphPreviewSVG() {
  if (glyphPreviewObjectUrl) {
    URL.revokeObjectURL(glyphPreviewObjectUrl);
    glyphPreviewObjectUrl = "";
  }
}

function renderSourceSVG(svgText, tokenId, tokenName) {
  if (!htmlUI || !htmlUI.sourceImage) return;

  releaseSourceSVG();

  const blob = new Blob([String(svgText || "")], {
    type: "image/svg+xml;charset=utf-8"
  });
  sourceSvgObjectUrl = URL.createObjectURL(blob);

  htmlUI.sourceImage.classList.remove("is-visible");
  htmlUI.sourceImage.hidden = false;
  htmlUI.sourceImage.setAttribute("title", (tokenName || "Checks #" + tokenId) + " · click to play if interactive");
  htmlUI.sourceImage.onload = () => {
    if (htmlUI.sourcePlaceholder) htmlUI.sourcePlaceholder.hidden = true;
    requestAnimationFrame(() => htmlUI.sourceImage.classList.add("is-visible"));
  };
  htmlUI.sourceImage.data = sourceSvgObjectUrl;
}

function renderGlyphPreviewSVG() {
  if (!htmlUI || !htmlUI.glyphPreviewImage) return;

  const svgText = buildGlyphsSVGDocument();
  if (!svgText) return;

  releaseGlyphPreviewSVG();

  const blob = new Blob([svgText], {
    type: "image/svg+xml;charset=utf-8"
  });
  glyphPreviewObjectUrl = URL.createObjectURL(blob);

  htmlUI.glyphPreviewImage.classList.remove("is-visible");
  htmlUI.glyphPreviewImage.hidden = false;
  htmlUI.glyphPreviewImage.alt = "SVG glyph preview for Checks #" + loadedTokenId;
  htmlUI.glyphPreviewImage.onload = () => {
    requestAnimationFrame(() => htmlUI.glyphPreviewImage.classList.add("is-visible"));
  };
  htmlUI.glyphPreviewImage.src = glyphPreviewObjectUrl;

  if (htmlUI.canvasHolder) htmlUI.canvasHolder.classList.add("is-hidden");
}

function renderResultMetadata(tokenId) {
  if (!htmlUI) return;

  const value = input => String(input ?? "unknown").toUpperCase();
  const isKnown = input => {
    const normalized = String(input ?? "").trim().toLowerCase();
    return normalized && !["unknown", "n/a", "na", "null", "undefined"].includes(normalized);
  };

  if (htmlUI.sourceTitle) {
    htmlUI.sourceTitle.textContent =
      "CHECKS #" + tokenId + (loadedSourceState === "historical" ? " · HISTORICAL" : "");
  }
  if (htmlUI.glyphTitle) htmlUI.glyphTitle.textContent = "GLYPH FOR CHECKS #" + tokenId;
  if (htmlUI.metaToken) htmlUI.metaToken.textContent = tokenId;
  if (htmlUI.metaChecks) htmlUI.metaChecks.textContent = String(checks.length);

  if (htmlUI.metaSpeed && htmlUI.metaSpeedItem) {
    const showSpeed = isKnown(loadedTraits.speed);
    htmlUI.metaSpeedItem.hidden = !showSpeed;
    if (showSpeed) htmlUI.metaSpeed.textContent = value(loadedTraits.speed);
  }

  if (htmlUI.metaShift && htmlUI.metaShiftItem) {
    const showShift = isKnown(loadedTraits.shift);
    htmlUI.metaShiftItem.hidden = !showShift;
    if (showShift) htmlUI.metaShift.textContent = value(loadedTraits.shift);
  }

  if (htmlUI.metaGradient && htmlUI.metaGradientItem) {
    const showGradient = isKnown(loadedTraits.gradient);
    htmlUI.metaGradientItem.hidden = !showGradient;
    if (showGradient) htmlUI.metaGradient.textContent = value(loadedTraits.gradient);
  }

  if (htmlUI.resultDetails) htmlUI.resultDetails.hidden = false;
  if (htmlUI.htmlSaveBtn) htmlUI.htmlSaveBtn.disabled = false;
  if (htmlUI.htmlSaveSvgBtn) htmlUI.htmlSaveSvgBtn.disabled = false;
}

function renderChromaticPaths() {
  if (!htmlUI || !htmlUI.chromaticPathRows) return;

  const root = htmlUI.chromaticPathRows;
  const fragment = document.createDocumentFragment();
  root.replaceChildren();

  checks.forEach((checkObj, checkIndex) => {
    const row = document.createElement("div");
    row.className =
      "chromatic-path-row " +
      (chromaticPathMode === "band" ? "is-band" : "is-steps");

    const label = document.createElement("span");
    label.textContent = String(checkIndex + 1).padStart(2, "0");
    row.appendChild(label);

    if (chromaticPathMode === "band") {
      const band = document.createElement("span");
      band.className = "path-band";
      band.style.background = buildContinuousGradientCSS(checkObj);
      band.title = "Check " + (checkIndex + 1) + " · continuous chromatic path";
      row.appendChild(band);
    } else {
      const samples = buildVisibleColorSamples(
        checkObj,
        checkObj.glyphTraversal.length
      );

      for (let sampleIndex = 0; sampleIndex < GLYPH_CELLS; sampleIndex++) {
        const swatch = document.createElement("span");
        const sample = samples[sampleIndex];
        swatch.className = sample ? "path-swatch" : "path-swatch is-empty";

        if (sample) {
          swatch.style.backgroundColor = sample.color;
          swatch.title =
            "Check " +
            (checkIndex + 1) +
            " · sample " +
            (sampleIndex + 1) +
            " · t=" +
            sample.t.toFixed(2);
        }

        row.appendChild(swatch);
      }
    }

    fragment.appendChild(row);
  });

  root.appendChild(fragment);

  if (htmlUI.pathCount) {
    htmlUI.pathCount.textContent = checks.length + " CHECK" + (checks.length === 1 ? "" : "S");
  }

  if (htmlUI.pathToggle) {
    htmlUI.pathToggle.disabled = false;
    htmlUI.pathToggle.textContent = chromaticPathActionLabel(false);
  }

  syncChromaticPathModeUI();
}

function buildContinuousGradientCSS(checkObj) {
  const track = getExactTrack(checkObj);
  const stops = [];

  if (!track.colors.length) return "#111111";

  for (let i = 0; i < track.colors.length; i++) {
    const color = normalizeSvgColor(track.colors[i]);
    const pct = roundNumber(Math.max(0, Math.min(1, Number(track.keyTimes[i] ?? 0))) * 100);

    if (i === 0 && pct !== "0") stops.push(`${color} 0%`);
    stops.push(`${color} ${pct}%`);
    if (i === track.colors.length - 1 && pct !== "100") stops.push(`${color} 100%`);
  }

  return `linear-gradient(90deg, ${stops.join(", ")})`;
}

function resetPresentation() {
  if (!htmlUI) return;

  releaseSourceSVG();
  releaseGlyphPreviewSVG();
  setLoadingState(false);
  setStatusTone("");
  setTransductionStage("idle");

  if (htmlUI.sourceImage) {
    htmlUI.sourceImage.classList.remove("is-visible");
    htmlUI.sourceImage.hidden = true;
    htmlUI.sourceImage.removeAttribute("data");
    htmlUI.sourceImage.removeAttribute("title");
  }
  if (htmlUI.glyphPreviewImage) {
    htmlUI.glyphPreviewImage.classList.remove("is-visible");
    htmlUI.glyphPreviewImage.hidden = true;
    htmlUI.glyphPreviewImage.removeAttribute("src");
    htmlUI.glyphPreviewImage.alt = "";
  }
  if (htmlUI.canvasHolder) htmlUI.canvasHolder.classList.remove("is-hidden");
  if (htmlUI.sourcePlaceholder) htmlUI.sourcePlaceholder.hidden = false;
  if (htmlUI.sourceTitle) htmlUI.sourceTitle.textContent = "CHECKS #—";
  if (htmlUI.glyphTitle) htmlUI.glyphTitle.textContent = "GLYPH FOR CHECKS #—";
  if (htmlUI.resultDetails) htmlUI.resultDetails.hidden = true;
  if (htmlUI.metaSpeedItem) htmlUI.metaSpeedItem.hidden = false;
  if (htmlUI.metaShiftItem) htmlUI.metaShiftItem.hidden = false;
  if (htmlUI.metaGradientItem) htmlUI.metaGradientItem.hidden = false;
  if (htmlUI.chromaticPathPanel) htmlUI.chromaticPathPanel.hidden = true;
  if (htmlUI.chromaticPathRows) htmlUI.chromaticPathRows.replaceChildren();
  if (htmlUI.pathToggle) {
    htmlUI.pathToggle.disabled = true;
    htmlUI.pathToggle.textContent = "REVEAL CHROMATIC PATHS";
    htmlUI.pathToggle.setAttribute("aria-expanded", "false");
  }
  setChromaticPathMode("steps");
  if (htmlUI.htmlSaveBtn) htmlUI.htmlSaveBtn.disabled = !checks.length;
  if (htmlUI.htmlSaveSvgBtn) htmlUI.htmlSaveSvgBtn.disabled = !checks.length;
}

function saveCurrentGlyphs() {
  if (!checks.length) {
    setStatus("TRANSDUCE A TOKEN BEFORE EXPORTING.");
    return;
  }

  const token = /^\d+$/.test(String(loadedTokenId || ""))
    ? loadedTokenId
    : "glyphs";

  saveCanvas(`checkglyphs-${token}-glyphs`, "png");
}

function saveCurrentGlyphsSVG() {
  if (!checks.length) {
    setStatus("TRANSDUCE A TOKEN BEFORE EXPORTING.");
    return;
  }

  const token = /^\d+$/.test(String(loadedTokenId || ""))
    ? loadedTokenId
    : "glyphs";

  const svgText = buildGlyphsSVGDocument();
  if (!svgText) {
    setStatusTone("error");
    setStatus("UNABLE TO BUILD SVG OUTPUT.");
    return;
  }

  downloadTextFile(`checkglyphs-${token}-glyphs.svg`, svgText, "image/svg+xml;charset=utf-8");
}

function downloadTextFile(filename, text, mimeType = "text/plain;charset=utf-8") {
  const blob = new Blob([String(text || "")], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// ----------------------------------
// TOKEN ID LOADER
// ----------------------------------

async function loadCheckFromTokenId(tokenIdRaw) {
  const tokenId = String(tokenIdRaw || "").trim();

  if (!/^\d+$/.test(tokenId)) {
    setStatusTone("error");
    setStatus("ENTER A VALID NUMERIC TOKEN ID.");
    if (htmlUI && htmlUI.htmlTokenInput) htmlUI.htmlTokenInput.focus();
    return;
  }

  try {
    resetAll();
    setLoadingState(true);
    setStatusTone("");
    setTransductionStage("reading");
    setStatus("READING ON-CHAIN SVG · CHECKS #" + tokenId);

    const source = await fetchCheckSourceFromContract(tokenId);
    let metadata = null;
    let name = "Checks #" + tokenId;
    let traits = extractTokenTraits(null);
    let svgText = source.svgText || "";

    loadedSourceState = source.state;

    if (source.metadataURI) {
      metadata = await resolveTokenMetadata(source.metadataURI);
      name = metadata && metadata.name ? metadata.name : name;
      traits = extractTokenTraits(metadata);
      svgText = await extractSVGFromMetadata(metadata);
    } else if (source.state === "historical") {
      name += " · Historical Original";
    }

    if (!svgText || !svgText.includes("<svg")) {
      throw new CheckSourceError(
        "INVALID_SVG",
        "The on-chain response did not contain a valid Checks SVG."
      );
    }

    setTransductionStage("extracting");
    setStatus("EXTRACTING CHROMATIC PATHS · CHECKS #" + tokenId);
    renderSourceSVG(svgText, tokenId, name);

    loadedTokenId = tokenId;
    loadedTraits = traits;

    setTransductionStage("rendering");
    setStatus("FORMING DETERMINISTIC GLYPHS · CHECKS #" + tokenId);
    parseSVGText(svgText);
    renderResultMetadata(tokenId);
    renderGlyphPreviewSVG();
    renderChromaticPaths();

    setTransductionStage("complete");
    setStatus(
      source.state === "historical"
        ? "TRANSDUCTION COMPLETE · HISTORICAL ORIGINAL #" + tokenId
        : "TRANSDUCTION COMPLETE · CHECKS #" + tokenId
    );
  } catch (err) {
    console.error(err);
    const errorCode = err && err.code ? err.code : "NETWORK";
    resetAll();
    setStatusTone("error");

    if (errorCode === "NOT_ORIGINAL") {
      setStatus("NO MIGRATED OR HISTORICAL CHECKS ORIGINAL FOUND FOR #" + tokenId + ".");
    } else if (window.location.protocol === "file:") {
      setStatus("NETWORK ACCESS FAILED · RUN NPM START AND TRY CHECKS #" + tokenId + " AGAIN.");
    } else {
      setStatus("UNABLE TO RETRIEVE CHECKS #" + tokenId + " · TRY AGAIN LATER.");
    }
  } finally {
    setLoadingState(false);
  }
}

class CheckSourceError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CheckSourceError";
    this.code = code;
  }
}

async function fetchCheckSourceFromContract(tokenId) {
  const tokenURIData = buildTokenURIEthCallData(tokenId);
  const rpcUrls = buildRPCList();
  let lastErr = null;
  let contractRevertSeen = false;

  for (const rpcUrl of rpcUrls) {
    try {
      const result = await ethCall(rpcUrl, CHECKS_CONTRACT, tokenURIData);
      const decoded = decodeAbiString(result);
      if (decoded) {
        return {
          state: "active",
          metadataURI: decoded,
          svgText: "",
          rpcUrl
        };
      }
    } catch (err) {
      lastErr = err;
      contractRevertSeen = contractRevertSeen || isContractRevert(err);
      console.warn("tokenURI RPC failed:", rpcUrl, err);

      if (!isContractRevert(err)) continue;

      try {
        const svgText = await fetchHistoricalSVGFromContract(rpcUrl, tokenId);
        if (isRevealedChecksSVG(svgText)) {
          return {
            state: "historical",
            metadataURI: "",
            svgText,
            rpcUrl
          };
        }
      } catch (historicalErr) {
        lastErr = historicalErr;
        console.warn("Historical SVG fallback failed:", rpcUrl, historicalErr);
      }
    }
  }

  if (contractRevertSeen) {
    throw new CheckSourceError(
      "NOT_ORIGINAL",
      "This ID is not an active or historically rendered Checks Original."
    );
  }

  throw lastErr || new CheckSourceError("NETWORK", "No RPC endpoint returned Checks data.");
}

async function fetchTokenURIFromContract(tokenId) {
  const source = await fetchCheckSourceFromContract(tokenId);
  if (!source.metadataURI) {
    throw new CheckSourceError("NOT_ACTIVE", "The Checks Original is historical, not active.");
  }
  return source.metadataURI;
}

async function fetchHistoricalSVGFromContract(rpcUrl, tokenId) {
  const selector = await getSvgFunctionSelector(rpcUrl);
  const data = buildUint256CallData(selector, tokenId);
  const result = await ethCall(rpcUrl, CHECKS_CONTRACT, data);
  return decodeAbiString(result);
}

async function getSvgFunctionSelector(rpcUrl) {
  if (svgFunctionSelector) return svgFunctionSelector;

  const signatureHex = utf8ToRpcHex(SVG_FUNCTION_SIGNATURE);
  const hash = await rpcRequest(rpcUrl, "web3_sha3", [signatureHex]);

  if (!/^0x[0-9a-fA-F]{64}$/.test(String(hash || ""))) {
    throw new Error("RPC did not return a valid Keccak hash for svg(uint256).");
  }

  svgFunctionSelector = hash.slice(0, 10);
  return svgFunctionSelector;
}

function isRevealedChecksSVG(svgText) {
  const source = String(svgText || "");
  return (
    source.includes("<svg") &&
    /<animate\b[^>]*attributeName=["']fill["']/i.test(source) &&
    /<use\b[^>]*(?:href|xlink:href)=["']#check["']/i.test(source)
  );
}

function isContractRevert(error) {
  const message = String(error && error.message ? error.message : error || "").toLowerCase();
  return (
    message.includes("execution reverted") ||
    message.includes("revert") ||
    message.includes("erc721") && message.includes("invalid token")
  );
}

function buildRPCList() {
  return DEFAULT_RPC_ENDPOINTS.slice();
}

function buildTokenURIEthCallData(tokenId) {
  return buildUint256CallData(TOKEN_URI_SELECTOR, tokenId);
}

function buildUint256CallData(selector, tokenId) {
  const normalizedSelector = String(selector || "").startsWith("0x")
    ? String(selector).slice(2)
    : String(selector || "");
  const id = BigInt(tokenId);
  const hex = id.toString(16).padStart(64, "0");
  return "0x" + normalizedSelector + hex;
}

function utf8ToRpcHex(value) {
  const bytes = new TextEncoder().encode(String(value || ""));
  return "0x" + Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

async function rpcRequest(rpcUrl, method, params, timeoutMs = 12000) {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeout = controller
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;

  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: controller ? controller.signal : undefined
    });

    if (!res.ok) {
      throw new Error("HTTP " + res.status + " from " + rpcUrl);
    }

    const json = await res.json();

    if (json.error) {
      throw new Error(json.error.message || JSON.stringify(json.error));
    }

    if (json.result === undefined || json.result === null) {
      throw new Error("Empty " + method + " result from " + rpcUrl);
    }

    return json.result;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function ethCall(rpcUrl, to, data) {
  const result = await rpcRequest(rpcUrl, "eth_call", [
    { to, data },
    "latest"
  ]);

  if (!result || result === "0x") {
    throw new Error("Empty eth_call result from " + rpcUrl);
  }

  return result;
}

function decodeAbiString(hex) {
  if (!hex || !hex.startsWith("0x")) return "";

  const data = hex.slice(2);
  if (data.length < 128) return "";

  const offset = Number(BigInt("0x" + data.slice(0, 64)));
  const lenStart = offset * 2;
  const len = Number(BigInt("0x" + data.slice(lenStart, lenStart + 64)));
  const strStart = lenStart + 64;
  const strHex = data.slice(strStart, strStart + len * 2);

  return hexToUtf8(strHex);
}

function hexToUtf8(hex) {
  const bytes = [];

  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.slice(i, i + 2), 16));
  }

  const decoder = new TextDecoder("utf-8");
  return decoder.decode(new Uint8Array(bytes));
}

async function resolveTokenMetadata(uri) {
  const text = await resolveURIToText(uri);

  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error("tokenURI did not resolve to valid JSON metadata.");
  }
}

async function resolveURIToText(uri) {
  if (!uri) throw new Error("Empty URI.");

  const s = String(uri).trim();

  if (s.startsWith("data:")) {
    return decodeDataURIToText(s);
  }

  const url = normalizeFetchURL(s);
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error("Could not fetch URI: HTTP " + res.status);
  }

  return await res.text();
}

function decodeDataURIToText(uri) {
  const comma = uri.indexOf(",");
  if (comma < 0) return "";

  const meta = uri.slice(0, comma).toLowerCase();
  const payload = uri.slice(comma + 1);

  if (meta.includes(";base64")) {
    return atob(payload);
  }

  try {
    return decodeURIComponent(payload);
  } catch (e) {
    return payload;
  }
}

function normalizeFetchURL(uri) {
  if (uri.startsWith("ipfs://")) {
    return "https://ipfs.io/ipfs/" + uri.slice("ipfs://".length).replace(/^ipfs\//, "");
  }

  if (uri.startsWith("ar://")) {
    return "https://arweave.net/" + uri.slice("ar://".length);
  }

  return uri;
}

async function extractSVGFromMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") {
    throw new Error("Missing metadata object.");
  }

  const candidates = [
    metadata.image_data,
    metadata.image,
    metadata.animation_url,
    metadata.external_url
  ].filter(Boolean);

  for (const candidate of candidates) {
    const s = String(candidate);

    if (s.includes("<svg")) {
      return s;
    }

    if (s.startsWith("data:image/svg+xml")) {
      return decodeDataURIToText(s);
    }

    if (s.startsWith("data:")) {
      const decoded = decodeDataURIToText(s);
      if (decoded.includes("<svg")) return decoded;
    }

    if (/^(https?:|ipfs:|ar:)/i.test(s)) {
      try {
        const text = await resolveURIToText(s);
        if (text.includes("<svg")) return text;

        try {
          const nested = JSON.parse(text);
          const nestedSvg = await extractSVGFromMetadata(nested);
          if (nestedSvg) return nestedSvg;
        } catch (e) {}
      } catch (err) {
        console.warn("Could not resolve SVG candidate", s, err);
      }
    }
  }

  throw new Error("No SVG found in metadata.");
}

function extractTokenTraits(metadata) {
  const out = {
    speed: "unknown",
    shift: "unknown",
    gradient: "unknown",
    all: {}
  };

  if (!metadata || !Array.isArray(metadata.attributes)) return out;

  for (const attr of metadata.attributes) {
    const traitTypeRaw = String(attr?.trait_type || "").trim();
    const traitType = traitTypeRaw.toLowerCase();
    const value = String(attr?.value || "").trim();

    if (!traitTypeRaw) continue;

    out.all[traitTypeRaw] = value;

    if (traitType === "speed") {
      out.speed = value || "unknown";
    }

    if (traitType === "shift") {
      out.shift = value || "unknown";
    }

    // Flexible capture of the global visual trait.
    // This is intentionally broad, because metadata names can vary.
    if (
      traitType.includes("gradient") ||
      traitType.includes("gradation") ||
      traitType.includes("transition") ||
      traitType.includes("direction") ||
      traitType.includes("pattern") ||
      traitType.includes("layout") ||
      traitType.includes("composition")
    ) {
      if (out.gradient === "unknown") {
        out.gradient = value || "unknown";
      }
    }
  }

  return out;
}

// ----------------------------------
// PARSE SVG
// ----------------------------------

function parseSVGText(svgText) {
  const source = String(svgText || "");
  const parser = new DOMParser();
  const doc = parser.parseFromString(source, "image/svg+xml");

  const parserError = doc.querySelector("parsererror");
  if (parserError) {
    throw new Error("Unable to parse the token SVG.");
  }

  svgLayout = extractChecksLayout(doc);
  checks = extractChecks(doc);

  if (!checks.length) {
    throw new Error('No <use href="#check"> elements were found in the token SVG.');
  }

  checks.sort((a, b) => {
    const dy = a.y - b.y;
    if (Math.abs(dy) > 2) return dy;

    const dx = a.x - b.x;
    if (Math.abs(dx) > 2) return dx;

    return a.rawOrder - b.rawOrder;
  });

  assignApproxGridCoordinates(checks);

  // First pass: extract the chromatic field descriptor and stable on-chain
  // identity. The field is behavior-derived; identity only resolves a member
  // of that field during the second pass.
  checks.forEach(c => {
    c.exactSignature = computeExactTrackSignature(c);
    c.metrics = computeMetrics(c);
    c.identity = buildCheckIdentity(c);
  });


  // Second pass: resolve one glyph realization per Check. Collision retries may
  // choose another archetype, transform or density inside the same admissible
  // field, but cannot escape into an unrelated chromatic neighborhood.
  const usedShapeSignatures = new Set();

  checks.forEach(c => {
    const selection = selectGlyphDataWithoutCollision(c, usedShapeSignatures);
    const glyphData = selection.glyphData;
    const collisionAttempt = selection.collisionAttempt;

    c.path25 = rowPath();
    c.visibleIndices = glyphData.visibleIndices;
    c.hiddenIndices = glyphData.hiddenIndices;
    c.visibleColorMap = glyphData.visibleColorMap;
    c.glyphFamilyId = glyphData.familyId;
    c.inflectionId = glyphData.inflectionId;
    c.glyphProfile = glyphData.profile;
    c.glyphDNA = glyphData.dna;
    c.glyphOriginIndex = glyphData.originIndex;
    c.glyphTraversal = glyphData.traversal;
    c.glyphCollisionAttempt = collisionAttempt;
  });

  setupCanvasFromLayout();
  redraw();
}

// ----------------------------------
// GLYPH SYSTEM — CHROMATIC FIELD + IDENTITY-RESOLVED REALIZATION
// ----------------------------------

function prepareGlyphBuild(checkObj) {
  const speedKey = normalizeSpeedKey(loadedTraits.speed);
  const shiftKey = normalizeShiftKey(loadedTraits.shift);
  const gradientKey = normalizeGradientKey(loadedTraits.gradient);
  const identity = checkObj.identity || buildCheckIdentity(checkObj);
  const profile = deriveGlyphEngineV2Profile(
    checkObj,
    speedKey,
    shiftKey,
    gradientKey
  );

  return { identity, profile };
}

function buildGlyphShapeCandidate(checkObj, collisionAttempt, prepared) {
  const { identity, profile } = prepared;
  const seeds = buildGlyphSeeds(checkObj, profile, identity, collisionAttempt);
  const generated = generateGlyphShapeV2(seeds.family, seeds.individual, profile);

  return {
    visibleIndices: generated.indices,
    phenotypeIndices: generated.phenotypeIndices,
    realization: generated.realization,
    seeds,
    collisionAttempt
  };
}

function finalizeGlyphData(checkObj, candidate, prepared) {
  const { identity, profile } = prepared;
  const {
    visibleIndices,
    phenotypeIndices,
    realization,
    seeds,
    collisionAttempt
  } = candidate;
  const realizedProfile = realization
    ? {
        ...profile,
        fieldFamily: realization.fieldFamily,
        family: realization.family,
        symmetryMode: realization.symmetryMode,
        densityLevel: realization.densityLevel,
        interiorMode: realization.interiorMode,
        componentMode: realization.componentMode,
        targetCount: realization.targetCount
      }
    : profile;

  const originIndex = chooseGlyphOriginV2(
    visibleIndices,
    realizedProfile,
    seeds.family
  );
  const traversal = buildGlyphTraversalV2(
    visibleIndices,
    originIndex,
    seeds.family + "|" + seeds.individual
  );
  const visibleSamples = buildVisibleColorSamples(checkObj, traversal.length);

  const visibleColorMap = {};
  for (let i = 0; i < traversal.length; i++) {
    visibleColorMap[traversal[i]] = visibleSamples[i].color;
  }

  validateTransductionOrigin(checkObj, traversal, visibleColorMap);

  const visibleSet = new Set(visibleIndices);
  const hiddenIndices = allIndices().filter(index => !visibleSet.has(index));

  return {
    visibleIndices,
    hiddenIndices,
    visibleColorMap,
    originIndex,
    traversal,
    familyId: hashString(seeds.family + ":" + realizedProfile.family),
    inflectionId: hashString(seeds.individual + ":realization"),
    profile: realizedProfile,
    dna: {
      schema: CHECKGLYPHS_SCHEMA_VERSION,
      engine: GLYPH_ENGINE_VERSION,
      source: identity.source,
      local: identity.local,
      chromaticSignature: identity.chromaticSignature,
      behaviorKey: profile.behaviorKey,
      behavior: profile.behavior,
      phenotypeIndices: (phenotypeIndices || visibleIndices).slice(),
      familySeed: seeds.family,
      individualSeed: seeds.individual,
      collisionAttempt,
      fieldFamily: profile.family,
      family: realizedProfile.family,
      symmetry: realizedProfile.symmetryMode,
      density: realizedProfile.densityLevel,
      interior: realizedProfile.interiorMode,
      components: realizedProfile.componentMode,
      targetCount: realizedProfile.targetCount,
      realization,
      originIndex,
      traversal: traversal.slice(),
      initialColor: getInitialCheckColor(checkObj)
    }
  };
}

function findGlyphCandidateWithoutCollision(
  checkObj,
  usedShapeSignatures,
  prepared,
  collisionAttempt = 0
) {
  const candidate = buildGlyphShapeCandidate(
    checkObj,
    collisionAttempt,
    prepared
  );
  const shapeSignature = computeGlyphShapeSignature(candidate.visibleIndices);

  if (!usedShapeSignatures.has(shapeSignature)) {
    usedShapeSignatures.add(shapeSignature);
    return {
      candidate,
      collisionAttempt
    };
  }

  const nextAttempt = collisionAttempt + 1;

  if (nextAttempt >= MAX_GLYPH_COLLISION_ATTEMPTS) {
    // Preserve the previous renderer's exact fallback semantics: the final
    // candidate is accepted, while the public attempt counter reaches MAX.
    return {
      candidate,
      collisionAttempt: nextAttempt
    };
  }

  return findGlyphCandidateWithoutCollision(
    checkObj,
    usedShapeSignatures,
    prepared,
    nextAttempt
  );
}

function selectGlyphDataWithoutCollision(checkObj, usedShapeSignatures) {
  const prepared = prepareGlyphBuild(checkObj);
  const selection = findGlyphCandidateWithoutCollision(
    checkObj,
    usedShapeSignatures,
    prepared
  );

  return {
    glyphData: finalizeGlyphData(checkObj, selection.candidate, prepared),
    collisionAttempt: selection.collisionAttempt
  };
}

function buildGlyphData(checkObj, collisionAttempt = 0) {
  const prepared = prepareGlyphBuild(checkObj);
  const candidate = buildGlyphShapeCandidate(
    checkObj,
    collisionAttempt,
    prepared
  );
  return finalizeGlyphData(checkObj, candidate, prepared);
}

// The field seed contains only behavior-preserving descriptors. Identity does
// not alter the chromatic field; it resolves one admissible realization inside
// that field. This permits genuine diversity inside uniform color bands without
// returning to an unrestricted exact-signature hash lottery.
function buildGlyphSeeds(checkObj, profile, identity, collisionAttempt = 0) {
  const family =
    "checkglyphs-v2.3-field" +
    "|speed:" + profile.speedKey +
    "|shift:" + profile.shiftKey +
    "|gradient:" + profile.gradientKey +
    "|behavior:" + profile.behaviorKey +
    "|field-family:" + profile.family +
    "|symmetry-tendency:" + profile.symmetryMode +
    "|density-envelope:" + profile.densityLevel +
    "|interior-tendency:" + profile.interiorMode +
    "|topology:" + profile.componentMode;

  // Identity resolves an admissible realization inside the chromatic field.
  // It is intentionally absent from field construction itself. Collision salt
  // explores another member of the same field rather than a foreign family.
  const individual =
    "checkglyphs-v2.3-realization" +
    "|token:" + identity.legacySourceKey +
    "|check-index:" + identity.localIndex +
    "|collision:" + collisionAttempt;

  return { family, individual };
}

function buildCheckIdentity(checkObj) {
  const tokenId = String(loadedTokenId || "");
  const source = {
    kind: "onchain-token",
    contract: CHECKS_CONTRACT.toLowerCase(),
    tokenId
  };

  const localIndex = Number.isInteger(checkObj.rawOrder)
    ? checkObj.rawOrder
    : 0;

  const local = {
    index: localIndex,
    x: normalizeIdentityNumber(checkObj.sourceX),
    y: normalizeIdentityNumber(checkObj.sourceY),
    scale: normalizeIdentityNumber(checkObj.sourceScale)
  };

  return {
    source,
    local,
    localIndex,
    chromaticSignature:
      checkObj.exactSignature || computeExactTrackSignature(checkObj),
    legacySourceKey: tokenId || "unknown-token"
  };
}

function normalizeIdentityNumber(value) {
  return Number.isFinite(value) ? Number(value.toFixed(6)) : null;
}

function getInitialCheckColor(checkObj) {
  // The <use fill="..."> value is the color actually visible before the
  // click-triggered SMIL animation starts, so it is the canonical origin.
  if (isUsableColor(checkObj.initialFill)) return checkObj.initialFill;

  const track = getExactTrack(checkObj);
  return track.colors[0] || "#eeeeee";
}

function validateTransductionOrigin(checkObj, traversal, colorMap) {
  const origin = traversal[0];
  const firstVisible = traversal.length ? Math.min(...traversal) : null;
  const expected = normalizeColorKey(getInitialCheckColor(checkObj));
  const actual = normalizeColorKey(colorMap[origin]);

  if (
    !traversal.length ||
    origin !== firstVisible ||
    expected !== actual
  ) {
    console.warn("CheckGlyphs chromatic-origin invariant failed", {
      checkIndex: checkObj.rawOrder,
      policy: CHROMATIC_ORIGIN_POLICY,
      origin,
      firstVisible,
      expected,
      actual
    });
  }
}


// ----------------------------------
// GLYPH ENGINE V2 — PROCEDURAL MORPHOLOGY
// ----------------------------------

function deriveGlyphEngineV2Profile(checkObj, speedKey, shiftKey, gradientKey) {
  const m = checkObj.metrics || computeMetrics(checkObj);
  const behavior = deriveChromaticBehaviorV22(checkObj);
  const trackClass = computeTrackClassV22(behavior);
  const family = chooseGlyphFamilyV22(behavior, speedKey, gradientKey);
  const symmetryMode = chooseSymmetryModeV22(family, behavior);
  const densityLevel = chooseDensityLevelV22(family, behavior, speedKey);
  const interiorMode = chooseInteriorModeV22(family, behavior);
  const componentMode = chooseComponentModeV23(family, behavior);
  const behaviorKey = buildChromaticBehaviorKeyV22(behavior);

  return {
    engineVersion: GLYPH_ENGINE_VERSION,
    speedKey,
    shiftKey,
    gradientKey,
    trackClass,
    behaviorKey,
    behavior,
    family,
    fieldFamily: family,
    symmetryMode,
    densityLevel,
    interiorMode,
    componentMode,
    mostlySymmetric:
      symmetryMode === "exact_vertical" ||
      symmetryMode === "exact_horizontal" ||
      symmetryMode === "near_vertical" ||
      symmetryMode === "near_horizontal" ||
      symmetryMode === "rotational",
    elemental: family === "bar" || family === "scatter",
    morphology: family,
    uniqueCount: m.uniqueCount,
    meanDelta: m.meanDelta,
    returnsToOrigin: m.returnsToOrigin
  };
}

// A fixed 25-sample description makes morphology depend on the continuous
// signal C(t), rather than on the spelling of the SVG color list. All values
// are invariant under token identity and robust to sub-perceptual perturbations.
function deriveChromaticBehaviorV22(checkObj) {
  const track = getExactTrack(checkObj);
  const sampleCount = 25;
  const labs = [];

  for (let i = 0; i < sampleCount; i++) {
    const t = i / (sampleCount - 1);
    const lab = colorToLab(sampleColorAtTime(track.colors, track.keyTimes, t));
    labs.push(lab || { L: 50, a: 0, b: 0 });
  }

  const steps = [];
  const vectors = [];
  let totalVariation = 0;
  let luminanceVariation = 0;

  for (let i = 1; i < labs.length; i++) {
    const previous = labs[i - 1];
    const current = labs[i];
    const vector = {
      L: current.L - previous.L,
      a: current.a - previous.a,
      b: current.b - previous.b
    };
    const distance = sqrt(
      vector.L * vector.L +
      vector.a * vector.a +
      vector.b * vector.b
    );

    vectors.push(vector);
    steps.push(distance);
    totalVariation += distance;
    luminanceVariation += abs(vector.L);
  }

  const meanStep = steps.length ? totalVariation / steps.length : 0;
  let stepVariance = 0;
  let maxStep = 0;
  let weightedTime = 0;

  for (let i = 0; i < steps.length; i++) {
    const difference = steps[i] - meanStep;
    stepVariance += difference * difference;
    maxStep = max(maxStep, steps[i]);
    weightedTime += steps[i] * ((i + 0.5) / steps.length);
  }

  stepVariance = steps.length ? stepVariance / steps.length : 0;
  const stepDeviation = sqrt(stepVariance);
  const roughness = meanStep > 0.000001
    ? constrain(stepDeviation / meanStep / 1.6, 0, 1)
    : 0;
  const changeCenter = totalVariation > 0.000001
    ? weightedTime / totalVariation
    : 0.5;

  const start = labs[0];
  const end = labs[labs.length - 1];
  const netVector = {
    L: end.L - start.L,
    a: end.a - start.a,
    b: end.b - start.b
  };
  const netDistance = sqrt(
    netVector.L * netVector.L +
    netVector.a * netVector.a +
    netVector.b * netVector.b
  );
  const directionality = totalVariation > 0.000001
    ? constrain(netDistance / totalVariation, 0, 1)
    : 0;
  const endpointCloseness = constrain(1 - netDistance / 55, 0, 1);
  const exactLoop = colorsAlmostEqual(
    track.colors[0],
    track.colors[track.colors.length - 1]
  );
  const closure = totalVariation > 0.000001
    ? (exactLoop ? 1 : constrain((1 - directionality) * endpointCloseness, 0, 1))
    : 1;

  let turningSum = 0;
  let turningCount = 0;
  for (let i = 1; i < vectors.length; i++) {
    const a = vectors[i - 1];
    const b = vectors[i];
    const ma = steps[i - 1];
    const mb = steps[i];
    if (ma < 0.000001 || mb < 0.000001) continue;
    const cosine = constrain(
      (a.L * b.L + a.a * b.a + a.b * b.b) / (ma * mb),
      -1,
      1
    );
    turningSum += (1 - cosine) * 0.5;
    turningCount++;
  }
  const turning = turningCount ? constrain(turningSum / turningCount, 0, 1) : 0;

  const peakThreshold = meanStep + stepDeviation * 0.45;
  let peakCount = 0;
  for (let i = 0; i < steps.length; i++) {
    const left = i > 0 ? steps[i - 1] : -1;
    const right = i + 1 < steps.length ? steps[i + 1] : -1;
    if (steps[i] > peakThreshold && steps[i] >= left && steps[i] >= right) {
      peakCount++;
    }
  }

  const gaps = [];
  for (let i = 1; i < track.keyTimes.length; i++) {
    gaps.push(max(0, track.keyTimes[i] - track.keyTimes[i - 1]));
  }
  const meanGap = gaps.length ? gaps.reduce((sum, value) => sum + value, 0) / gaps.length : 1;
  let gapVariance = 0;
  for (const gap of gaps) {
    const difference = gap - meanGap;
    gapVariance += difference * difference;
  }
  gapVariance = gaps.length ? gapVariance / gaps.length : 0;
  const timingIrregularity = meanGap > 0.000001
    ? constrain(sqrt(gapVariance) / meanGap / 1.5, 0, 1)
    : 0;

  const uniqueCount = uniqueColorList(track.colors).length;
  const uniqueComplexity = constrain((uniqueCount - 1) / 7, 0, 1);
  const activity = constrain(totalVariation / 520, 0, 1);
  const peakComplexity = constrain(peakCount / 5, 0, 1);
  const luminanceDrift = end.L - start.L;
  const luminanceMotion = constrain(luminanceVariation / 180, 0, 1);
  const chromaDrift = sqrt(
    netVector.a * netVector.a + netVector.b * netVector.b
  );

  return {
    sampleCount,
    uniqueCount,
    uniqueComplexity,
    totalVariation,
    meanStep,
    maxStep,
    activity,
    roughness,
    closure,
    directionality,
    turning,
    peakCount,
    peakComplexity,
    changeCenter,
    timingIrregularity,
    luminanceDrift,
    luminanceMotion,
    chromaDrift,
    returnsToOrigin: exactLoop || closure >= 0.86
  };
}

function computeTrackClassV22(behavior) {
  const activity = behavior.activity < 0.16
    ? "still"
    : behavior.activity < 0.42
      ? "calm"
      : behavior.activity < 0.72
        ? "active"
        : "intense";
  const topology = behavior.closure >= 0.78
    ? "closed"
    : behavior.directionality >= 0.62
      ? "directed"
      : "folded";
  const rhythm = behavior.roughness < 0.28
    ? "even"
    : behavior.roughness < 0.62
      ? "modulated"
      : "irregular";

  return activity + "-" + topology + "-" + rhythm;
}

function quantizeBehaviorV22(value, steps) {
  return constrain(floor(constrain(value, 0, 0.999999) * steps), 0, steps - 1);
}

function buildChromaticBehaviorKeyV22(behavior) {
  const luminanceClass = behavior.luminanceDrift > 4
    ? "rise"
    : behavior.luminanceDrift < -4
      ? "fall"
      : "level";

  return [
    "a" + quantizeBehaviorV22(behavior.activity, 6),
    "r" + quantizeBehaviorV22(behavior.roughness, 5),
    "c" + quantizeBehaviorV22(behavior.closure, 6),
    "d" + quantizeBehaviorV22(behavior.directionality, 5),
    "t" + quantizeBehaviorV22(behavior.turning, 5),
    "p" + constrain(behavior.peakCount, 0, 6),
    "m" + quantizeBehaviorV22(behavior.changeCenter, 7),
    "k" + quantizeBehaviorV22(behavior.timingIrregularity, 4),
    "u" + constrain(behavior.uniqueCount, 1, 9),
    "l" + luminanceClass
  ].join("-");
}

function chooseGlyphFamilyV22(behavior, speedKey, gradientKey) {
  const a = behavior.activity;
  const r = behavior.roughness;
  const c = behavior.closure;
  const d = behavior.directionality;
  const t = behavior.turning;
  const p = behavior.peakComplexity;
  const m = behavior.changeCenter;
  const k = behavior.timingIrregularity;
  const u = behavior.uniqueComplexity;
  const offCenter = abs(m - 0.5) * 2;

  // Each branch names a visible property of C(t). The order is intentional:
  // stillness and true closure are topological facts; only then do rhythm,
  // direction and temporal distribution refine the family.
  if (a < 0.075) return "bar";

  if (c >= 0.80) {
    if (t >= 0.54 || (u >= 0.58 && p >= 0.38)) return "knot";
    if (a < 0.34 && r < 0.48) return "gate";
    if (r >= 0.54 || p >= 0.48) return "mask";
    return "chamber";
  }

  if (c >= 0.56) {
    if (t >= 0.58) return "knot";
    if (p >= 0.48 || r >= 0.58) return "mask";
    if (a < 0.36) return "gate";
    return "chamber";
  }

  if (r >= 0.78) {
    if (p >= 0.58 || k >= 0.66) return "scatter";
    if (d >= 0.48) return "rune";
    return "composite";
  }

  if (p >= 0.58) {
    if (m <= 0.43) return "fork";
    if (m >= 0.62) return "altar";
    return r >= 0.55 ? "scatter" : "fork";
  }

  if (d >= 0.68) {
    if (k >= 0.42 || offCenter >= 0.34 || speedKey === "fast") return "stair";
    if (a < 0.34 && r < 0.42) return "monolith";
    return "rune";
  }

  if (r >= 0.56) {
    if (t >= 0.56) return "composite";
    if (p >= 0.34) return "fork";
    return "rune";
  }

  if (m >= 0.67 && a >= 0.28) return "altar";
  if (m <= 0.33 && a >= 0.34) return "fork";
  if (c >= 0.34) return a >= 0.52 ? "mask" : "emblem";
  if (a < 0.30 && r < 0.42) return "monolith";
  if (gradientKey.includes("linear") && d >= 0.42) return "stair";
  if (r < 0.38 && offCenter < 0.30) return "emblem";
  return "composite";
}

function chooseSymmetryModeV22(family, behavior) {
  const closed = behavior.closure;
  const rough = behavior.roughness;
  const directed = behavior.directionality;
  const turning = behavior.turning;

  if (closed >= 0.82 && turning >= 0.48) return "rotational";
  if (closed >= 0.68 && rough < 0.58) return "exact_vertical";

  if (family === "bar" || family === "stair") {
    if (directed >= 0.66 && rough < 0.42) return "exact_horizontal";
    if (directed >= 0.48) return "near_horizontal";
  }

  if (rough >= 0.72 && closed < 0.55) return "free_stable";
  if (rough >= 0.46 || behavior.peakCount >= 3) return "near_vertical";
  return "exact_vertical";
}

function chooseDensityLevelV22(family, behavior, speedKey) {
  let information =
    behavior.activity * 0.28 +
    behavior.uniqueComplexity * 0.18 +
    behavior.peakComplexity * 0.14 +
    behavior.roughness * 0.12 +
    behavior.turning * 0.10 +
    behavior.timingIrregularity * 0.08 +
    behavior.luminanceMotion * 0.05;

  if (speedKey === "slow") information += 0.025;
  if (speedKey === "fast") information -= 0.025;
  if (family === "scatter" || family === "bar") information -= 0.055;
  if (family === "chamber" || family === "knot") information += 0.035;

  // The reference grammar is sparse by default: low information must be able
  // to resolve to two-, three- and four-cell signs instead of a compulsory mass.
  if (information < 0.18) return "minimal";
  if (information < 0.50) return "sparse";
  if (information < 0.79) return "medium";
  return "dense";
}

function chooseInteriorModeV22(family, behavior) {
  if (behavior.closure >= 0.84) {
    return behavior.turning >= 0.46 ? "chambered" : "hollow";
  }
  if (behavior.closure >= 0.62 && ["gate", "mask", "chamber", "emblem", "knot"].includes(family)) {
    return "hollow";
  }
  if (behavior.roughness >= 0.62 || behavior.peakCount >= 3) return "punctured";
  return "solid";
}


function chooseComponentModeV23(family, behavior) {
  // "accented" permits one detached punctuation mark; "split" permits two.
  // Even a still signal may be accented, which prevents color-band tokens from
  // collapsing into one repeated silhouette while preserving an elemental field.
  if (family === "scatter") return "split";
  if (behavior.roughness >= 0.72 || behavior.peakCount >= 4) return "split";
  if (behavior.closure >= 0.82 && behavior.roughness < 0.42) return "continuous";
  return "accented";
}

function generateGlyphShapeV2(familySeed, individualSeed, profile) {
  const realizationSeed = familySeed + "|" + individualSeed;
  const realizedFamily = chooseRealizedFamilyV23(profile, realizationSeed);
  const realizedDensity = chooseRealizedDensityV23(profile, realizationSeed);
  const realizedSymmetry = chooseRealizedSymmetryV23(realizedFamily, profile, realizationSeed);
  const realizedInterior = chooseRealizedInteriorV23(realizedFamily, profile, realizationSeed);
  const realizedComponents = chooseRealizedComponentModeV23(realizedFamily, profile, realizationSeed);

  const realizedProfile = {
    ...profile,
    fieldFamily: profile.family,
    family: realizedFamily,
    densityLevel: realizedDensity,
    symmetryMode: realizedSymmetry,
    interiorMode: realizedInterior,
    componentMode: realizedComponents
  };

  let shape = buildGlyphSkeletonV23(realizedFamily, realizationSeed + ":archetype");
  shape = applyGlyphTransformV23(shape, realizationSeed + ":transform", realizedProfile);
  shape = normalizeGlyphIndicesV2(shape);
  shape = applyBaseSymmetryV2(shape, realizedSymmetry);

  const targetCount = getGlyphTargetCountV23(realizedProfile, realizationSeed + ":target");
  realizedProfile.targetCount = targetCount;
  shape = fitGlyphToTargetV2(shape, targetCount, realizationSeed + ":silhouette", realizedProfile);
  shape = applyInteriorModeV2(shape, realizationSeed + ":interior", realizedProfile);
  shape = applyGlyphOrnamentV22(shape, realizationSeed + ":ornament", realizedProfile);
  shape = fitGlyphToTargetV2(shape, targetCount, realizationSeed + ":refit", realizedProfile);
  shape = applyControlledAsymmetryV2(shape, realizationSeed + ":asymmetry", realizedProfile);
  shape = applyGlyphDirectionV22(shape, realizedProfile);
  shape = validateAndRepairGlyphV2(shape, realizationSeed + ":validate", realizedProfile);

  const phenotype = uniqueSorted(shape);
  const inflected = applyFieldAccentV23(
    phenotype,
    realizationSeed + ":accent",
    realizedProfile
  );
  const finalShape = validateAndRepairGlyphV2(
    inflected,
    realizationSeed + ":final",
    realizedProfile
  );

  return {
    indices: uniqueSorted(finalShape),
    phenotypeIndices: phenotype,
    realization: {
      fieldFamily: profile.family,
      family: realizedFamily,
      densityLevel: realizedDensity,
      symmetryMode: realizedSymmetry,
      interiorMode: realizedInterior,
      componentMode: realizedComponents,
      targetCount,
      archetypeSeed: realizationSeed + ":archetype"
    }
  };
}


function chooseRealizedFamilyV23(profile, seed) {
  const pool = GLYPH_FAMILY_FIELD_V23[profile.family] || [profile.family];
  return pool[hashString(seed + ":realized-family") % pool.length];
}

function chooseRealizedDensityV23(profile, seed) {
  const pools = {
    minimal: ["minimal", "minimal", "minimal", "minimal", "sparse"],
    sparse: ["minimal", "minimal", "sparse", "sparse", "sparse", "sparse", "medium"],
    medium: ["minimal", "sparse", "sparse", "sparse", "medium", "medium", "medium", "dense"],
    dense: ["sparse", "sparse", "medium", "medium", "medium", "dense", "dense", "dense"]
  };
  const pool = pools[profile.densityLevel] || pools.sparse;
  return pool[hashString(seed + ":realized-density") % pool.length];
}

function chooseRealizedSymmetryV23(family, profile, seed) {
  const familyPools = {
    bar: ["free_stable", "free_stable", "exact_horizontal", "near_horizontal", "exact_vertical", "near_vertical", "rotational"],
    monolith: ["exact_vertical", "near_vertical", "free_stable", "free_stable", "exact_horizontal"],
    gate: ["exact_vertical", "exact_vertical", "near_vertical", "free_stable", "rotational"],
    mask: ["exact_vertical", "near_vertical", "free_stable", "rotational", "exact_horizontal"],
    fork: ["exact_vertical", "near_vertical", "free_stable", "free_stable", "near_horizontal"],
    altar: ["exact_vertical", "near_vertical", "free_stable", "exact_horizontal", "rotational"],
    knot: ["rotational", "exact_vertical", "free_stable", "near_vertical", "exact_horizontal"],
    stair: ["free_stable", "free_stable", "near_horizontal", "near_vertical", "rotational"],
    chamber: ["exact_vertical", "near_vertical", "rotational", "free_stable", "exact_horizontal"],
    scatter: ["free_stable", "free_stable", "rotational", "near_vertical", "near_horizontal"],
    emblem: ["exact_vertical", "free_stable", "near_vertical", "rotational", "exact_horizontal"],
    rune: ["free_stable", "free_stable", "near_vertical", "near_horizontal", "rotational"],
    composite: ["free_stable", "near_vertical", "near_horizontal", "rotational", "exact_vertical"]
  };
  const pool = (familyPools[family] || ["free_stable"]).slice();

  // The chromatic tendency remains a weighted member of the admissible set,
  // but no longer forces every Check in a band into one identical symmetry.
  pool.push(profile.symmetryMode, profile.symmetryMode);
  if (profile.behavior.closure >= 0.82) pool.push("rotational", "exact_vertical");
  if (profile.behavior.roughness >= 0.68) pool.push("free_stable", "near_vertical");
  return pool[hashString(seed + ":realized-symmetry") % pool.length];
}

function chooseRealizedInteriorV23(family, profile, seed) {
  let pool = ["solid", "solid", profile.interiorMode];
  if (["gate", "mask", "chamber", "knot"].includes(family)) {
    pool.push("hollow", "punctured", "chambered");
  }
  if (profile.densityLevel === "minimal" || profile.densityLevel === "sparse") {
    pool = pool.concat(["solid", "solid"]);
  }
  return pool[hashString(seed + ":realized-interior") % pool.length];
}

function chooseRealizedComponentModeV23(family, profile, seed) {
  let pool;
  if (profile.componentMode === "continuous") {
    pool = ["continuous", "continuous", "continuous", "continuous", "accented", "accented"];
  } else if (profile.componentMode === "split") {
    pool = ["accented", "accented", "split", "split", "split", "split"];
  } else {
    pool = ["continuous", "continuous", "accented", "accented", "accented", "accented", "accented", "split"];
  }
  if (family === "scatter") pool.push("split", "split", "split");
  if (family === "gate" || family === "chamber") pool.push("continuous", "continuous");
  return pool[hashString(seed + ":realized-components") % pool.length];
}

function buildGlyphSkeletonV23(family, seed) {
  const pool = GLYPH_FAMILY_ARCHETYPE_POOL_V23[family] || GLYPH_FAMILY_ARCHETYPE_POOL_V23.emblem;
  const name = pool[hashString(seed + ":name") % pool.length];
  const points = GLYPH_ARCHETYPES_V23[name] || GLYPH_ARCHETYPES_V23.cross5;
  return pointsToIndicesV2(points);
}

function rotateGlyphIndexV23(index, turns) {
  let point = glyphPointV2(index);
  let x = point.x;
  let y = point.y;
  for (let i = 0; i < ((turns % 4) + 4) % 4; i++) {
    const nextX = GLYPH_N - 1 - y;
    const nextY = x;
    x = nextX;
    y = nextY;
  }
  return glyphIndexV2(x, y);
}

function mirrorGlyphIndexVerticalV23(index) {
  const point = glyphPointV2(index);
  return glyphIndexV2(GLYPH_N - 1 - point.x, point.y);
}

function centerGlyphV23(indices) {
  let out = normalizeGlyphIndicesV2(indices);
  if (!out.length) return out;
  const points = out.map(glyphPointV2);
  const minX = min(...points.map(point => point.x));
  const maxX = max(...points.map(point => point.x));
  const minY = min(...points.map(point => point.y));
  const maxY = max(...points.map(point => point.y));
  const shiftX = round(2 - (minX + maxX) / 2);
  const shiftY = round(2 - (minY + maxY) / 2);
  const shifted = points.map(point => glyphIndexV2(point.x + shiftX, point.y + shiftY));
  if (shifted.every(index => index >= 0)) out = normalizeGlyphIndicesV2(shifted);
  return out;
}

function applyGlyphTransformV23(indices, seed, profile) {
  let out = normalizeGlyphIndicesV2(indices);
  let turns = [0, 0, 2];
  if (["bar", "monolith", "stair", "rune", "composite"].includes(profile.family)) {
    turns = [0, 0, 1, 2, 3];
  }
  if (profile.behavior.directionality >= 0.72) turns = [0, 0, 2];
  const quarterTurns = turns[hashString(seed + ":rotation") % turns.length];
  out = out.map(index => rotateGlyphIndexV23(index, quarterTurns));
  if (hash01(seed + ":mirror") < 0.45) out = out.map(mirrorGlyphIndexVerticalV23);
  return centerGlyphV23(out);
}

function getGlyphTargetCountV23(profile, seed) {
  const range = getGlyphCellRangeV2(profile);
  const span = range.max - range.min;
  if (span <= 0) return range.min;
  let u = (
    hash01(seed + ":a") +
    hash01(seed + ":b") +
    hash01(seed + ":c")
  ) / 3;
  if (profile.densityLevel === "minimal") {
    u = pow(u, 2.2);
  } else if (profile.densityLevel === "sparse") {
    u = pow(u, 1.65);
  } else if (profile.densityLevel === "dense") {
    u = 1 - pow(1 - u, 1.25);
  }
  return constrain(range.min + floor(u * (span + 1)), range.min, range.max);
}

function getGlyphComponentLimitV23(profile) {
  if (profile.family === "scatter" && profile.componentMode === "split") return 3;
  if (profile.componentMode === "split") return 2;
  if (profile.componentMode === "accented") return 2;
  return 1;
}

function getGlyphIsolatedLimitV23(profile) {
  if (profile.family === "scatter" && profile.componentMode === "split") return 2;
  if (profile.componentMode === "split" || profile.componentMode === "accented") return 1;
  return 0;
}

function applyFieldAccentV23(indices, seed, profile) {
  const base = normalizeGlyphIndicesV2(indices);
  const range = getGlyphCellRangeV2(profile);
  const candidates = [base];
  const componentLimit = getGlyphComponentLimitV23(profile);
  const isolatedLimit = getGlyphIsolatedLimitV23(profile);

  if (base.length > range.min) {
    for (const index of base) {
      const candidate = base.filter(value => value !== index);
      if (!candidate.length) continue;
      if (countGlyphComponentsV2(candidate) > componentLimit) continue;
      if (countIsolatedGlyphCellsV22(candidate) > isolatedLimit) continue;
      candidates.push(candidate);
    }
  }

  if (base.length < range.max) {
    for (const index of allIndices()) {
      if (base.includes(index)) continue;
      const candidate = uniqueSorted(base.concat(index));
      if (countGlyphComponentsV2(candidate) > componentLimit) continue;
      if (countIsolatedGlyphCellsV22(candidate) > isolatedLimit) continue;
      if (glyphBalancePenaltyV22(candidate) > 2.1) continue;
      candidates.push(candidate);
    }
  }

  const unique = [];
  const signatures = new Set();
  for (const candidate of candidates) {
    const signature = computeGlyphShapeSignature(candidate);
    if (signatures.has(signature)) continue;
    signatures.add(signature);
    unique.push(candidate);
  }
  return unique[hashString(seed + ":choice") % unique.length] || base;
}

function applyGlyphOrnamentV22(indices, seed, profile) {
  let out = normalizeGlyphIndicesV2(indices);
  const behavior = profile.behavior;
  let mode = "none";

  if (behavior.peakCount >= 4 || behavior.roughness >= 0.78) mode = "satellite";
  else if (behavior.closure >= 0.76 && behavior.turning >= 0.42) mode = "eye";
  else if (behavior.changeCenter <= 0.34 && behavior.activity >= 0.25) mode = "crown";
  else if (behavior.changeCenter >= 0.66 && behavior.activity >= 0.25) mode = "feet";
  else if (behavior.directionality >= 0.62 && behavior.activity >= 0.30) mode = "terminal";
  else if (behavior.peakCount >= 2 && out.includes(glyphIndexV2(2, 2))) mode = "notch";

  if (mode === "none") return out;
  if (mode === "notch") {
    const center = glyphIndexV2(2, 2);
    if (out.length > getGlyphCellRangeV2(profile).min) return out.filter(value => value !== center);
    return out;
  }

  const additions = [];
  if (mode === "crown") additions.push(glyphIndexV2(1, 0), glyphIndexV2(3, 0));
  if (mode === "feet") additions.push(glyphIndexV2(1, 4), glyphIndexV2(3, 4));
  if (mode === "eye") additions.push(glyphIndexV2(1, 1), glyphIndexV2(3, 1));
  if (mode === "satellite") additions.push(glyphIndexV2(0, 2), glyphIndexV2(4, 2));

  if (mode === "terminal") {
    const endpoints = out.filter(index => {
      return orthogonalNeighborsV2(index).filter(next => out.includes(next)).length <= 1;
    });
    if (endpoints.length) {
      endpoints.sort((a, b) => {
        const pa = glyphPointV2(a);
        const pb = glyphPointV2(b);
        const da = abs(pa.y - behavior.changeCenter * 4);
        const db = abs(pb.y - behavior.changeCenter * 4);
        if (da !== db) return da - db;
        return a - b;
      });
      const candidates = orthogonalNeighborsV2(endpoints[0]).filter(value => !out.includes(value));
      if (candidates.length) additions.push(candidates[hashString(seed + ":terminal") % candidates.length]);
    }
  }

  for (const index of additions) {
    if (index < 0) continue;
    out = uniqueSorted(out.concat(symmetryOrbitV2(index, profile.symmetryMode)));
  }
  return out;
}

function applyGlyphDirectionV22(indices, profile) {
  let out = normalizeGlyphIndicesV2(indices);
  const behavior = profile.behavior;

  // UV/IR is a global directional trait and therefore acts consistently,
  // without a probabilistic gate.
  if (profile.shiftKey === "IR") out = out.map(mirrorIndexHorizontalV2);

  // Rising light is oriented upward and falling light downward. The transform
  // is applied only when the luminance drift is perceptually meaningful.
  if (abs(behavior.luminanceDrift) >= 4) {
    const centroidY = out.reduce((sum, index) => sum + glyphPointV2(index).y, 0) / max(1, out.length);
    const wantsUpperMass = behavior.luminanceDrift > 0;
    if ((wantsUpperMass && centroidY > 2) || (!wantsUpperMass && centroidY < 2)) {
      out = out.map(index => {
        const point = glyphPointV2(index);
        return glyphIndexV2(point.x, GLYPH_N - 1 - point.y);
      });
    }
  }

  return normalizeGlyphIndicesV2(out);
}

function glyphBalancePenaltyV22(indices) {
  const visible = normalizeGlyphIndicesV2(indices);
  if (!visible.length) return 10;
  const centroid = visible.reduce((sum, index) => {
    const point = glyphPointV2(index);
    sum.x += point.x;
    sum.y += point.y;
    return sum;
  }, { x: 0, y: 0 });
  centroid.x /= visible.length;
  centroid.y /= visible.length;
  return abs(centroid.x - 2) + abs(centroid.y - 2);
}

function countIsolatedGlyphCellsV22(indices) {
  const visible = new Set(normalizeGlyphIndicesV2(indices));
  let isolated = 0;
  for (const index of visible) {
    if (!orthogonalNeighborsV2(index).some(next => visible.has(next))) isolated++;
  }
  return isolated;
}

function pointsToIndicesV2(points) {
  return uniqueSorted(points.map(p => glyphIndexV2(p[0], p[1])));
}

function glyphIndexV2(x, y) {
  if (x < 0 || x >= GLYPH_N || y < 0 || y >= GLYPH_N) return -1;
  return y * GLYPH_N + x;
}

function glyphPointV2(index) {
  return { x: index % GLYPH_N, y: floor(index / GLYPH_N) };
}

function normalizeGlyphIndicesV2(indices) {
  return uniqueSorted((indices || []).filter(index => index >= 0 && index < GLYPH_CELLS));
}

function baseSymmetryModeV2(mode) {
  if (mode === "near_vertical") return "exact_vertical";
  if (mode === "near_horizontal") return "exact_horizontal";
  return mode;
}

function symmetryOrbitV2(index, mode) {
  const p = glyphPointV2(index);
  const base = baseSymmetryModeV2(mode);

  if (base === "exact_vertical") {
    return uniqueSorted([index, glyphIndexV2(GLYPH_N - 1 - p.x, p.y)]);
  }

  if (base === "exact_horizontal") {
    return uniqueSorted([index, glyphIndexV2(p.x, GLYPH_N - 1 - p.y)]);
  }

  if (base === "rotational") {
    return uniqueSorted([index, glyphIndexV2(GLYPH_N - 1 - p.x, GLYPH_N - 1 - p.y)]);
  }

  return [index];
}

function applyBaseSymmetryV2(indices, mode) {
  const out = new Set();
  for (const index of normalizeGlyphIndicesV2(indices)) {
    for (const member of symmetryOrbitV2(index, mode)) out.add(member);
  }
  return uniqueSorted(Array.from(out));
}

function getGlyphCellRangeV2(profile) {
  const familyRanges = {
    monolith: { minimal: [2, 4], sparse: [3, 6], medium: [5, 8], dense: [7, 10] },
    gate: { minimal: [3, 5], sparse: [4, 7], medium: [6, 9], dense: [8, 11] },
    mask: { minimal: [3, 5], sparse: [4, 7], medium: [6, 9], dense: [8, 11] },
    fork: { minimal: [3, 5], sparse: [4, 7], medium: [6, 9], dense: [8, 11] },
    altar: { minimal: [3, 5], sparse: [4, 7], medium: [6, 9], dense: [8, 11] },
    bar: { minimal: [2, 4], sparse: [3, 6], medium: [5, 8], dense: [7, 10] },
    knot: { minimal: [4, 6], sparse: [5, 8], medium: [7, 10], dense: [9, 12] },
    stair: { minimal: [2, 5], sparse: [3, 6], medium: [5, 8], dense: [7, 10] },
    chamber: { minimal: [4, 6], sparse: [5, 8], medium: [7, 10], dense: [9, 12] },
    scatter: { minimal: [2, 4], sparse: [3, 6], medium: [4, 7], dense: [6, 9] },
    emblem: { minimal: [2, 5], sparse: [3, 6], medium: [5, 8], dense: [7, 10] },
    rune: { minimal: [2, 5], sparse: [3, 6], medium: [5, 8], dense: [7, 10] },
    composite: { minimal: [3, 6], sparse: [4, 7], medium: [6, 9], dense: [8, 12] }
  };

  const family = familyRanges[profile.family] || familyRanges.emblem;
  const pair = family[profile.densityLevel] || family.sparse;
  return { min: pair[0], max: pair[1] };
}

function fitGlyphToTargetV2(indices, target, seed, profile) {
  let out = applyBaseSymmetryV2(indices, profile.symmetryMode);
  let guard = 0;

  while (out.length < target && guard++ < 80) {
    const candidates = getAddableGlyphOrbitsV2(out, profile.symmetryMode, profile);
    if (!candidates.length) break;

    const ranked = candidates
      .map(orbit => ({
        orbit,
        score: scoreAddOrbitV2(orbit, out, seed, profile)
      }))
      .sort((a, b) => b.score - a.score);

    let chosen = ranked.find(item => {
      const addCount = item.orbit.filter(v => !out.includes(v)).length;
      return out.length + addCount <= target + 1;
    });

    if (!chosen) chosen = ranked[0];
    out = uniqueSorted(out.concat(chosen.orbit));
  }

  guard = 0;
  while (out.length > target && guard++ < 80) {
    const removable = getRemovableGlyphOrbitsV2(out, profile.symmetryMode);
    if (!removable.length) break;

    const ranked = removable
      .map(orbit => ({
        orbit,
        score: scoreRemoveOrbitV2(orbit, out, seed, profile)
      }))
      .sort((a, b) => b.score - a.score);

    const chosen = ranked.find(item => out.length - item.orbit.length >= 1);
    if (!chosen) break;
    out = out.filter(v => !chosen.orbit.includes(v));
  }

  return normalizeGlyphIndicesV2(out);
}

function getAddableGlyphOrbitsV2(indices, mode, profile) {
  const set = new Set(indices);
  const seen = new Set();
  const orbits = [];
  const componentLimit = getGlyphComponentLimitV23(profile);
  const isolatedLimit = getGlyphIsolatedLimitV23(profile);

  for (let index = 0; index < GLYPH_CELLS; index++) {
    const orbit = symmetryOrbitV2(index, mode);
    const key = orbit.join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    if (orbit.every(value => set.has(value))) continue;

    const candidate = uniqueSorted(indices.concat(orbit));
    const adjacent = orbit.some(value => orthogonalNeighborsV2(value).some(next => set.has(next)));
    const detachedAllowed = profile.componentMode !== "continuous";
    if (!adjacent && !detachedAllowed && indices.length) continue;
    if (countGlyphComponentsV2(candidate) > componentLimit) continue;
    if (countIsolatedGlyphCellsV22(candidate) > isolatedLimit) continue;
    orbits.push(orbit);
  }

  return orbits;
}

function getRemovableGlyphOrbitsV2(indices, mode) {
  const set = new Set(indices);
  const seen = new Set();
  const out = [];

  for (const index of indices) {
    const orbit = symmetryOrbitV2(index, mode).filter(v => set.has(v));
    const key = orbit.join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    if (orbit.length && orbit.length < indices.length) out.push(orbit);
  }

  return out;
}

function scoreAddOrbitV2(orbit, indices, seed, profile) {
  const set = new Set(indices);
  let adjacency = 0;
  let centrality = 0;
  let edgePresence = 0;

  for (const index of orbit) {
    adjacency += orthogonalNeighborsV2(index).filter(next => set.has(next)).length;
    const point = glyphPointV2(index);
    centrality += 4 - (abs(point.x - 2) + abs(point.y - 2));
    if (point.x === 0 || point.x === 4 || point.y === 0 || point.y === 4) edgePresence++;
  }

  let score = adjacency * 2.15 + centrality * 0.16 + edgePresence * 0.12;
  if (profile.componentMode === "split") score -= adjacency * 0.75;
  if (profile.family === "scatter") score -= adjacency * 1.2;
  if (["gate", "mask", "chamber"].includes(profile.family)) {
    score += orbit.some(index => glyphPointV2(index).x === 0 || glyphPointV2(index).x === 4) ? 0.35 : 0;
  }
  const candidate = uniqueSorted(indices.concat(orbit));
  score -= glyphBalancePenaltyV22(candidate) * 0.55;
  score += hash01(seed + ":add:" + orbit.join(",")) * 2.4;
  return score;
}

function scoreRemoveOrbitV2(orbit, indices, seed, profile) {
  const set = new Set(indices);
  let endpointScore = 0;
  let edgeScore = 0;

  for (const index of orbit) {
    const neighbors = orthogonalNeighborsV2(index).filter(n => set.has(n)).length;
    if (neighbors <= 1) endpointScore += 3;
    else if (neighbors === 2) endpointScore += 1;
    const p = glyphPointV2(index);
    if (p.x === 0 || p.x === 4 || p.y === 0 || p.y === 4) edgeScore += 1;
  }

  let score = endpointScore + edgeScore;
  if (profile.family === "scatter") score += 1;
  score += hash01(seed + ":remove:" + orbit.join(",")) * 1.8;
  return score;
}

function applyInteriorModeV2(indices, seed, profile) {
  let out = normalizeGlyphIndicesV2(indices);
  const center = glyphIndexV2(2, 2);

  if (profile.interiorMode === "solid") return out;

  if (profile.interiorMode === "punctured") {
    if (out.includes(center) && out.length > getGlyphCellRangeV2(profile).min) {
      out = out.filter(v => v !== center);
    }
    return out;
  }

  if (profile.interiorMode === "hollow" || profile.interiorMode === "chambered") {
    const removable = out.filter(index => {
      const p = glyphPointV2(index);
      if (p.x === 0 || p.x === 4 || p.y === 0 || p.y === 4) return false;
      return orthogonalNeighborsV2(index).filter(n => out.includes(n)).length >= 3;
    });

    if (removable.length) {
      const selected = removable[hashString(seed + ":hollow") % removable.length];
      out = out.filter(v => v !== selected);
    } else if (out.includes(center) && out.length > 5) {
      out = out.filter(v => v !== center);
    }
  }

  return normalizeGlyphIndicesV2(out);
}

function applyControlledAsymmetryV2(indices, seed, profile) {
  let out = normalizeGlyphIndicesV2(indices);
  if (profile.symmetryMode !== "near_vertical" && profile.symmetryMode !== "near_horizontal" && profile.symmetryMode !== "free_stable") {
    return applyBaseSymmetryV2(out, profile.symmetryMode);
  }

  const baseMode = baseSymmetryModeV2(profile.symmetryMode);
  out = applyBaseSymmetryV2(out, baseMode);
  const pairs = getRemovableGlyphOrbitsV2(out, baseMode).filter(orbit => orbit.length === 2);
  if (!pairs.length) return out;

  const pair = pairs[hashString(seed + ":asymmetry-pair") % pairs.length];
  const removeIndex = pair[hashString(seed + ":asymmetry-side") % pair.length];
  const candidate = out.filter(v => v !== removeIndex);

  if (candidate.length >= getGlyphCellRangeV2(profile).min) out = candidate;

  // Near-symmetry is deliberately limited to one missing counterpart.
  // This keeps the glyph recognizably balanced instead of turning the local
  // DNA inflection into a second independent motif.
  if (profile.symmetryMode === "free_stable" && hash01(seed + ":asymmetry-shift") < 0.48) {
    const p = glyphPointV2(removeIndex);
    const shifts = shuffleStable([[0, -1], [0, 1], [-1, 0], [1, 0]], seed + ":asymmetry-directions");
    for (const d of shifts) {
      const shifted = glyphIndexV2(p.x + d[0], p.y + d[1]);
      if (shifted >= 0 && !out.includes(shifted)) {
        out.push(shifted);
        break;
      }
    }
  }

  return normalizeGlyphIndicesV2(out);
}

function pruneGlyphComponentsV23(indices, limit, minCount, seed) {
  let out = normalizeGlyphIndicesV2(indices);
  let guard = 0;
  while (countGlyphComponentsV2(out) > limit && guard++ < 12) {
    const components = getGlyphComponentsV22(out)
      .map(component => ({
        component,
        score:
          component.length * 10 -
          glyphBalancePenaltyV22(component) +
          hash01(seed + ":component:" + component.join(",")) * 0.01
      }))
      .sort((a, b) => a.score - b.score);
    const removable = components.find(item => out.length - item.component.length >= minCount);
    if (!removable) break;
    const remove = new Set(removable.component);
    out = out.filter(index => !remove.has(index));
  }
  return normalizeGlyphIndicesV2(out);
}

function limitIsolatedGlyphCellsV23(indices, limit, minCount, seed) {
  let out = normalizeGlyphIndicesV2(indices);
  let isolated = out.filter(index => !orthogonalNeighborsV2(index).some(next => out.includes(next)));
  if (isolated.length <= limit) return out;
  isolated = isolated
    .map(index => ({
      index,
      distance: abs(glyphPointV2(index).x - 2) + abs(glyphPointV2(index).y - 2),
      noise: hash01(seed + ":isolated:" + index)
    }))
    .sort((a, b) => b.distance - a.distance || a.noise - b.noise);
  for (const item of isolated.slice(limit)) {
    if (out.length - 1 < minCount) break;
    out = out.filter(index => index !== item.index);
  }
  return normalizeGlyphIndicesV2(out);
}


function repairGlyphTopologyV23(indices, profile, range, seed) {
  let out = normalizeGlyphIndicesV2(indices);
  const componentLimit = getGlyphComponentLimitV23(profile);
  const isolatedLimit = getGlyphIsolatedLimitV23(profile);

  if (profile.componentMode === "continuous" && countGlyphComponentsV2(out) > 1) {
    out = connectGlyphComponentsV2(out, seed + ":connect", 1);
  }

  if (countGlyphComponentsV2(out) > componentLimit) {
    const components = getGlyphComponentsV22(out)
      .map(component => ({
        component,
        size: component.length,
        balance: glyphBalancePenaltyV22(component),
        noise: hash01(seed + ":keep:" + component.join(","))
      }))
      .sort((a, b) => b.size - a.size || a.balance - b.balance || a.noise - b.noise);
    const keep = new Set(components.slice(0, componentLimit).flatMap(item => item.component));
    out = out.filter(index => keep.has(index));
  }

  out = limitIsolatedGlyphCellsV23(out, isolatedLimit, 1, seed + ":isolated");

  if (out.length < range.min) {
    const repairProfile = { ...profile, componentMode: "continuous", symmetryMode: "free_stable" };
    out = fitGlyphToTargetV2(out, range.min, seed + ":regrow", repairProfile);
  }

  if (countGlyphComponentsV2(out) > componentLimit) {
    out = pruneGlyphComponentsV23(out, componentLimit, 1, seed + ":prune-final");
  }
  out = limitIsolatedGlyphCellsV23(out, isolatedLimit, 1, seed + ":isolated-final");
  return normalizeGlyphIndicesV2(out);
}

function validateAndRepairGlyphV2(indices, seed, profile) {
  let out = normalizeGlyphIndicesV2(indices);
  const range = getGlyphCellRangeV2(profile);
  const componentLimit = getGlyphComponentLimitV23(profile);

  if (!out.length) out = [glyphIndexV2(2, 2)];

  if (out.length < range.min || out.length > range.max) {
    const repairProfile = {
      ...profile,
      symmetryMode:
        profile.symmetryMode === "near_vertical" || profile.symmetryMode === "near_horizontal"
          ? "free_stable"
          : profile.symmetryMode
    };
    out = fitGlyphToTargetV2(
      out,
      constrain(out.length, range.min, range.max),
      seed + ":repair",
      repairProfile
    );
  }

  out = repairGlyphTopologyV23(out, profile, range, seed + ":topology");
  out = centerGlyphV23(out);

  if (profile.symmetryMode === "near_vertical" || profile.symmetryMode === "near_horizontal") {
    const candidate = applyControlledAsymmetryV2(
      applyBaseSymmetryV2(out, profile.symmetryMode),
      seed + ":final-near",
      profile
    );
    if (candidate.length <= range.max && countGlyphComponentsV2(candidate) <= componentLimit) out = candidate;
  }

  if (profile.symmetryMode === "exact_vertical" || profile.symmetryMode === "exact_horizontal" || profile.symmetryMode === "rotational") {
    const candidate = applyBaseSymmetryV2(out, profile.symmetryMode);
    if (candidate.length <= range.max && countGlyphComponentsV2(candidate) <= componentLimit) out = candidate;
  }

  if (out.length > range.max) {
    out = fitGlyphToTargetV2(out, range.max, seed + ":final-trim", {
      ...profile,
      symmetryMode: "free_stable"
    });
  }
  if (out.length < range.min) {
    out = fitGlyphToTargetV2(out, range.min, seed + ":final-grow", {
      ...profile,
      componentMode: "continuous",
      symmetryMode: "free_stable"
    });
  }

  out = repairGlyphTopologyV23(out, profile, range, seed + ":topology-final");
  if (out.length < range.min) {
    out = fitGlyphToTargetV2(out, range.min, seed + ":last-grow", {
      ...profile,
      componentMode: "continuous",
      symmetryMode: "free_stable"
    });
  }
  return centerGlyphV23(out);
}

function countGlyphComponentsV2(indices) {
  const remaining = new Set(indices);
  let count = 0;

  while (remaining.size) {
    count++;
    const first = remaining.values().next().value;
    const stack = [first];
    remaining.delete(first);

    while (stack.length) {
      const current = stack.pop();
      for (const next of orthogonalNeighborsV2(current)) {
        if (remaining.has(next)) {
          remaining.delete(next);
          stack.push(next);
        }
      }
    }
  }

  return count;
}

function getGlyphComponentsV22(indices) {
  const remaining = new Set(normalizeGlyphIndicesV2(indices));
  const components = [];

  while (remaining.size) {
    const first = remaining.values().next().value;
    const component = [];
    const stack = [first];
    remaining.delete(first);

    while (stack.length) {
      const current = stack.pop();
      component.push(current);
      for (const next of orthogonalNeighborsV2(current)) {
        if (!remaining.has(next)) continue;
        remaining.delete(next);
        stack.push(next);
      }
    }
    components.push(uniqueSorted(component));
  }

  return components;
}

function connectGlyphComponentsV2(indices, seed, targetComponents) {
  let out = normalizeGlyphIndicesV2(indices);
  let guard = 0;

  while (countGlyphComponentsV2(out) > targetComponents && guard++ < 24) {
    const components = getGlyphComponentsV22(out);
    let best = null;

    for (let ai = 0; ai < components.length; ai++) {
      for (let bi = ai + 1; bi < components.length; bi++) {
        for (const a of components[ai]) {
          for (const b of components[bi]) {
            const pa = glyphPointV2(a);
            const pb = glyphPointV2(b);
            const distance = abs(pa.x - pb.x) + abs(pa.y - pb.y);
            const score = distance + hash01(seed + ":bridge:" + a + ":" + b) * 0.001;
            if (!best || score < best.score) best = { a, b, score };
          }
        }
      }
    }

    if (!best) break;
    const destination = glyphPointV2(best.b);
    let point = glyphPointV2(best.a);

    // Add the complete Manhattan bridge in a stable order. Alternating the
    // preferred axis prevents all repairs from creating the same L-shaped bias.
    const horizontalFirst = hash01(seed + ":bridge-axis:" + best.a + ":" + best.b) < 0.5;
    const addHorizontalStep = () => {
      if (point.x === destination.x) return false;
      point = { x: point.x + (destination.x > point.x ? 1 : -1), y: point.y };
      out.push(glyphIndexV2(point.x, point.y));
      return true;
    };
    const addVerticalStep = () => {
      if (point.y === destination.y) return false;
      point = { x: point.x, y: point.y + (destination.y > point.y ? 1 : -1) };
      out.push(glyphIndexV2(point.x, point.y));
      return true;
    };

    while (point.x !== destination.x || point.y !== destination.y) {
      if (horizontalFirst) {
        if (!addHorizontalStep()) addVerticalStep();
      } else {
        if (!addVerticalStep()) addHorizontalStep();
      }
    }
    out = normalizeGlyphIndicesV2(out);
  }

  return out;
}

function orthogonalNeighborsV2(index) {
  const p = glyphPointV2(index);
  const points = [[p.x - 1, p.y], [p.x + 1, p.y], [p.x, p.y - 1], [p.x, p.y + 1]];
  return points.map(v => glyphIndexV2(v[0], v[1])).filter(v => v >= 0);
}

function mirrorIndexHorizontalV2(index) {
  const p = glyphPointV2(index);
  return glyphIndexV2(GLYPH_N - 1 - p.x, p.y);
}

function chooseGlyphOriginV2(indices, profile, seed) {
  const visible = normalizeGlyphIndicesV2(indices);
  if (!visible.length) return glyphIndexV2(2, 2);

  // Semantic invariant: the first visible cell in normal row-major reading
  // order is always t=0. Direction traits may influence the morphology and the
  // continuation of the path, but never move the recognition anchor.
  return visible[0];
}

function findOrthogonalHamiltonianTraversalV22(indices, originIndex, seed) {
  const visible = new Set(normalizeGlyphIndicesV2(indices));
  if (!visible.size || !visible.has(originIndex)) return null;

  const path = [originIndex];
  const unvisited = new Set(visible);
  unvisited.delete(originIndex);
  let explored = 0;
  const explorationLimit = 20000;

  function search(current) {
    if (!unvisited.size) return true;
    if (explored++ >= explorationLimit) return false;

    const candidates = orthogonalNeighborsV2(current).filter(next => unvisited.has(next));
    candidates.sort((a, b) => {
      const degreeA = orthogonalNeighborsV2(a).filter(next => unvisited.has(next)).length;
      const degreeB = orthogonalNeighborsV2(b).filter(next => unvisited.has(next)).length;
      if (degreeA !== degreeB) return degreeA - degreeB;
      return hashString(seed + ":hamiltonian:" + current + ":" + a) -
        hashString(seed + ":hamiltonian:" + current + ":" + b);
    });

    for (const next of candidates) {
      path.push(next);
      unvisited.delete(next);
      if (search(next)) return true;
      unvisited.add(next);
      path.pop();
    }
    return false;
  }

  return search(originIndex) ? path.slice() : null;
}

function buildGlyphTraversalV2(indices, originIndex, seed) {
  const visible = new Set(normalizeGlyphIndicesV2(indices));
  if (!visible.size) return [];

  const origin = visible.has(originIndex) ? originIndex : visible.values().next().value;
  const continuous = findOrthogonalHamiltonianTraversalV22(
    Array.from(visible),
    origin,
    seed
  );
  if (continuous) return continuous;

  const traversal = [];
  const unvisited = new Set(visible);
  let current = origin;

  while (unvisited.size) {
    traversal.push(current);
    unvisited.delete(current);
    if (!unvisited.size) break;

    const adjacent = orthogonalNeighborsV2(current).filter(value => unvisited.has(value));
    const pool = adjacent.length ? adjacent : Array.from(unvisited);
    const point = glyphPointV2(current);

    pool.sort((a, b) => {
      const pa = glyphPointV2(a);
      const pb = glyphPointV2(b);
      const distanceA = abs(pa.x - point.x) + abs(pa.y - point.y);
      const distanceB = abs(pb.x - point.x) + abs(pb.y - point.y);
      if (distanceA !== distanceB) return distanceA - distanceB;

      // When continuity is still possible, prefer the cell with more onward
      // options. This delays dead ends and minimizes unavoidable jumps.
      const degreeA = orthogonalNeighborsV2(a).filter(next => unvisited.has(next)).length;
      const degreeB = orthogonalNeighborsV2(b).filter(next => unvisited.has(next)).length;
      if (degreeA !== degreeB) return degreeB - degreeA;

      return hashString(seed + ":path:" + current + ":" + a) -
        hashString(seed + ":path:" + current + ":" + b);
    });

    current = pool[0];
  }

  return traversal;
}

function computeGlyphShapeSignature(indices) {
  return uniqueSorted(indices || []).join(",");
}

function normalizeSpeedKey(speed) {
  const s = String(speed || "").trim().toLowerCase();

  if (s.includes("0.5")) return "slow";
  if (s.includes("½")) return "slow";
  if (s.includes("slow")) return "slow";

  if (s.includes("2x")) return "fast";
  if (s.includes("2.0")) return "fast";
  if (s === "2") return "fast";
  if (s.includes("fast")) return "fast";

  if (s.includes("1x")) return "medium";
  if (s.includes("1.0")) return "medium";
  if (s === "1") return "medium";
  if (s.includes("medium")) return "medium";
  if (s.includes("normal")) return "medium";

  const map = ["slow", "medium", "fast"];
  return map[hashString(s || "unknown-speed") % map.length];
}

function normalizeShiftKey(shift) {
  const s = String(shift || "").trim().toUpperCase();

  if (s === "UV") return "UV";
  if (s === "IR") return "IR";

  return hash01(s || "unknown-shift") < 0.5 ? "UV" : "IR";
}

function normalizeGradientKey(gradient) {
  const s = String(gradient || "").trim().toLowerCase();

  if (!s || s === "unknown") return "unknown";

  if (s.includes("linear") && s.includes("z")) return "linear-z";
  if (s.includes("linear")) return "linear";
  if (s.includes("radial")) return "radial";
  if (s.includes("spiral")) return "spiral";
  if (s.includes("mirror")) return "mirror";
  if (s.includes("checker")) return "checker";
  if (s.includes("noise")) return "noise";

  return s
    .replace(/[^\w]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function computeTrackClass(checkObj) {
  const m = checkObj.metrics || computeMetrics(checkObj);

  let u = "uM";
  if (m.uniqueCount <= 2) u = "uS";
  else if (m.uniqueCount <= 4) u = "uM";
  else if (m.uniqueCount <= 7) u = "uL";
  else u = "uXL";

  let d = "dM";
  if (m.meanDelta < 16) d = "dS";
  else if (m.meanDelta < 34) d = "dM";
  else d = "dL";

  const r = m.returnsToOrigin ? "loop" : "open";

  return u + "-" + d + "-" + r;
}

function pickHybridRuneFamily(seed, profile) {
  let bank;

  if (profile.elemental) {
    bank = getElementalRuneBank(profile.speedKey, profile.shiftKey, profile.gradientKey)
      .concat(getPrimitiveRuneBank(profile.speedKey, profile.shiftKey));
  } else if (profile.morphology === "linear" || profile.gradientKey.includes("linear")) {
    bank = getLinearRichRuneBank(profile.speedKey, profile.shiftKey);
  } else if (profile.morphology === "primitive") {
    bank = getPrimitiveRuneBank(profile.speedKey, profile.shiftKey);
  } else if (profile.morphology === "container") {
    bank = getContainerRuneBank(profile.speedKey, profile.shiftKey);
  } else if (profile.morphology === "block") {
    bank = getBlockRuneBank(profile.speedKey, profile.shiftKey);
  } else if (profile.morphology === "dotted") {
    bank = getDottedRuneBank(profile.speedKey, profile.shiftKey);
  } else if (profile.morphology === "angular") {
    bank = getAsymmetricRuneBank(profile.speedKey, profile.shiftKey);
  } else {
    // Old checkpoint core grammar.
    bank = profile.mostlySymmetric
      ? getSymmetricRuneBank(profile.speedKey, profile.shiftKey)
      : getAsymmetricRuneBank(profile.speedKey, profile.shiftKey);

    // New vocabulary mixed into the old grammar, not replacing it.
    bank = bank
      .concat(getPrimitiveRuneBank(profile.speedKey, profile.shiftKey))
      .concat(getLinearRichRuneBank(profile.speedKey, profile.shiftKey))
      .concat(getBlockRuneBank(profile.speedKey, profile.shiftKey))
      .concat(getContainerRuneBank(profile.speedKey, profile.shiftKey));
  }

  if (!profile.mostlySymmetric && profile.morphology !== "angular") {
    bank = bank.concat(getAsymmetricRuneBank(profile.speedKey, profile.shiftKey));
  }

  const idx = hashString(seed + ":canonical-expanded-family") % bank.length;
  return uniqueSorted(bank[idx].slice());
}

function getElementalRuneBank(speedKey, shiftKey, gradientKey) {
  const base = [
    // single point / atom
    [12],

    // small bars
    [11, 12, 13],
    [7, 12, 17],

    // double points
    [11, 13],
    [7, 17],

    // little face
    [6, 8, 16, 17, 18],
    [6, 8, 12, 16, 18],
    [6, 8, 17],

    // simple blocks / dry squares
    [6, 7, 11, 12],
    [7, 8, 12, 13],
    [11, 12, 16, 17],
    [12, 13, 17, 18],

    // small temple / primitive sign
    [7, 11, 12, 13],
    [11, 12, 13, 17],
    [7, 12, 16, 18],

    // minimal check-like traces
    [10, 11, 12],
    [12, 13, 14],
    [2, 7, 12],
    [12, 17, 22]
  ];

  const richer = [
    [6, 8, 11, 12, 13],
    [7, 11, 12, 13, 17],
    [6, 7, 8, 12],
    [12, 16, 17, 18],
    [2, 7, 12, 17, 22],
    [10, 11, 12, 13, 14]
  ];

  let bank = base.slice();

  if (speedKey !== "fast") {
    bank = bank.concat(richer);
  }

  if (gradientKey === "linear-z") {
    bank = bank.concat([
      [2, 7, 12, 17, 22],
      [10, 11, 12, 13, 14],
      [6, 7, 12, 17, 18],
      [8, 7, 12, 17, 16],
      [6, 11, 12, 13, 18],
      [8, 13, 12, 11, 16]
    ]);
  }

  if (shiftKey === "IR") {
    bank = bank.map(set => rotateIndexSet90(set));
  }

  return bank.map(uniqueSorted);
}

function getPrimitiveRuneBank(speedKey, shiftKey) {
  let bank = [
    [12],
    [11, 12, 13],
    [7, 12, 17],
    [6, 8, 16, 18],
    [6, 8, 16, 17, 18],
    [7, 11, 12, 13],
    [11, 12, 13, 17],
    [6, 7, 11, 12],
    [7, 8, 12, 13],
    [7, 12, 16, 18],
    [6, 8, 12, 16, 18]
  ];

  if (speedKey === "slow") {
    bank = bank.concat([
      [6, 7, 8, 11, 12, 13],
      [11, 12, 13, 16, 17, 18],
      [7, 11, 12, 13, 17]
    ]);
  }

  if (shiftKey === "IR") {
    bank = bank.map(set => rotateIndexSet90(set));
  }

  return bank.map(uniqueSorted);
}

function getLinearRichRuneBank(speedKey, shiftKey) {
  let bank = [
    [2, 7, 12, 17, 22],
    [10, 11, 12, 13, 14],
    [1, 2, 3],
    [21, 22, 23],
    [5, 10, 15],
    [9, 14, 19],
    [6, 7, 8],
    [16, 17, 18],
    [6, 11, 12, 13, 18],
    [8, 13, 12, 11, 16],
    [2, 7, 12, 13, 14],
    [10, 11, 12, 17, 22],
    [6, 7, 12, 17, 18],
    [8, 7, 12, 17, 16]
  ];

  if (speedKey !== "fast") {
    bank = bank.concat([
      [2, 7, 12, 17, 22, 11, 13],
      [10, 11, 12, 13, 14, 7, 17],
      [6, 8, 11, 12, 13, 16, 18],
      [7, 11, 12, 13, 17]
    ]);
  }

  if (shiftKey === "IR") {
    bank = bank.map(set => rotateIndexSet90(set));
  }

  return bank.map(uniqueSorted);
}

function getContainerRuneBank(speedKey, shiftKey) {
  let bank = [
    [6, 8, 10, 14, 16, 17, 18],
    [6, 8, 10, 14, 16, 18, 22],
    [6, 8, 11, 13, 16, 17, 18],
    [7, 10, 14, 16, 17, 18],
    [6, 7, 8, 10, 14, 16, 18],
    [1, 2, 3, 6, 8, 11, 13]
  ];

  if (speedKey === "slow") {
    bank = bank.concat([
      [1, 2, 3, 6, 8, 10, 14, 16, 17, 18],
      [6, 8, 10, 14, 16, 18, 21, 22, 23]
    ]);
  }

  if (shiftKey === "IR") {
    bank = bank.map(set => rotateIndexSet90(set));
  }

  return bank.map(uniqueSorted);
}

function getBlockRuneBank(speedKey, shiftKey) {
  let bank = [
    [6, 7, 11, 12],
    [7, 8, 12, 13],
    [11, 12, 16, 17],
    [12, 13, 17, 18],
    [6, 7, 8, 11, 12, 13],
    [11, 12, 13, 16, 17, 18],
    [6, 7, 8, 11, 13],
    [11, 13, 16, 17, 18]
  ];

  if (speedKey === "slow") {
    bank = bank.concat([
      [6, 7, 8, 11, 12, 13, 16, 17, 18],
      [1, 2, 3, 6, 7, 8, 11, 12, 13]
    ]);
  }

  if (shiftKey === "IR") {
    bank = bank.map(set => rotateIndexSet90(set));
  }

  return bank.map(uniqueSorted);
}

function getDottedRuneBank(speedKey, shiftKey) {
  let bank = [
    [6, 8, 16, 18],
    [2, 10, 14, 22],
    [0, 4, 12, 20, 24],
    [6, 8, 12],
    [12, 16, 18],
    [1, 3, 21, 23],
    [7, 11, 13, 17]
  ];

  if (speedKey !== "fast") {
    bank = bank.concat([
      [0, 4, 6, 8, 16, 18],
      [2, 6, 8, 12, 16, 18, 22],
      [6, 8, 11, 13, 16, 18]
    ]);
  }

  if (shiftKey === "IR") {
    bank = bank.map(set => rotateIndexSet90(set));
  }

  return bank.map(uniqueSorted);
}

function getSymmetricRuneBank(speedKey, shiftKey) {
  const base = [
    // gate
    [0, 4, 5, 9, 10, 14, 15, 19, 21, 22, 23],
    // trident
    [0, 2, 4, 7, 12, 17, 21, 22, 23],
    // altar
    [0, 1, 2, 3, 4, 7, 12, 16, 18, 22],
    // arch
    [0, 1, 2, 3, 4, 5, 9, 10, 14, 15, 19],
    // fork
    [0, 4, 6, 8, 12, 17, 21, 22, 23],
    // totem
    [0, 2, 4, 7, 12, 17, 22],
    // shield
    [0, 4, 6, 8, 10, 14, 16, 18, 22],
    // crown
    [0, 2, 4, 6, 8, 11, 13, 17, 22],
    // pillar-bar
    [0, 4, 5, 9, 10, 11, 12, 13, 14, 17, 22],
    // basin
    [0, 4, 6, 8, 10, 14, 16, 17, 18],
    // cross altar
    [0, 2, 4, 7, 10, 11, 12, 13, 14, 17, 22],
    // twin pillar
    [0, 4, 5, 9, 10, 14, 15, 19, 20, 24],
    // rune cup
    [0, 4, 6, 8, 11, 12, 13, 17, 21, 23],
    // hooked shrine
    [0, 2, 4, 5, 9, 12, 15, 19, 22]
  ];

  const slowExtra = [
    [0, 1, 2, 3, 4, 5, 9, 10, 11, 12, 13, 14, 22],
    [0, 4, 5, 6, 8, 9, 10, 14, 15, 16, 18, 19, 22],
    [0, 1, 3, 4, 5, 9, 10, 12, 14, 15, 19, 21, 23]
  ];

  const fastExtra = [
    [0, 2, 4, 7, 12, 17, 22],
    [0, 4, 6, 8, 12, 18, 22],
    [0, 4, 7, 12, 17, 22],
    [0, 2, 4, 12, 22]
  ];

  let bank = base.slice();

  if (speedKey === "slow") bank = bank.concat(slowExtra);
  if (speedKey === "fast") bank = bank.concat(fastExtra);

  if (shiftKey === "IR") {
    bank = bank.map(set => rotateIndexSet90(set));
  }

  return bank.map(uniqueSorted);
}

function getAsymmetricRuneBank(speedKey, shiftKey) {
  const base = [
    // hooked stair
    [0, 1, 6, 11, 12, 13, 18],
    // leaning L
    [0, 5, 10, 15, 16, 17, 18],
    // zig
    [0, 1, 7, 13, 19, 23],
    // broken staff
    [0, 5, 6, 11, 17, 22],
    // angled hook
    [0, 1, 2, 8, 13, 18],
    // bent rune
    [0, 5, 11, 12, 13, 19, 24],
    // step spear
    [0, 6, 12, 13, 19, 24],
    // corner sigil
    [0, 1, 2, 5, 10, 16, 22],
    // glyph K
    [0, 5, 10, 6, 12, 18, 24],
    // glyph tail
    [0, 1, 6, 12, 17, 22, 23]
  ];

  const slowExtra = [
    [0, 1, 2, 5, 10, 11, 12, 17, 22],
    [0, 5, 6, 7, 12, 17, 18, 23]
  ];

  const fastExtra = [
    [0, 6, 12, 18],
    [0, 1, 7, 13, 19],
    [0, 5, 11, 17, 23]
  ];

  let bank = base.slice();

  if (speedKey === "slow") bank = bank.concat(slowExtra);
  if (speedKey === "fast") bank = bank.concat(fastExtra);

  if (shiftKey === "IR") {
    bank = bank.map(set => rotateIndexSet90(set));
  }

  return bank.map(uniqueSorted);
}

function rotateIndexSet90(set) {
  return uniqueSorted(set.map(rotateIndex90));
}

function rotateIndex90(idx) {
  const x = idx % GLYPH_N;
  const y = floor(idx / GLYPH_N);

  const nx = GLYPH_N - 1 - y;
  const ny = x;

  return ny * GLYPH_N + nx;
}

function allIndices() {
  const out = [];
  for (let i = 0; i < GLYPH_CELLS; i++) out.push(i);
  return out;
}

function buildVisibleColorSamples(checkObj, visibleCount) {
  const track = getExactTrack(checkObj);
  const initialColor = getInitialCheckColor(checkObj);
  const samples = [];

  if (visibleCount <= 0) return samples;

  // Never interpolate or approximate the recognition anchor.
  samples.push({ index: 0, t: 0, color: initialColor });

  if (visibleCount === 1) return samples;

  for (let i = 1; i < visibleCount; i++) {
    const t = i / (visibleCount - 1);

    samples.push({
      index: i,
      t,
      color: sampleColorAtTime(track.colors, track.keyTimes, t)
    });
  }

  return samples;
}

// ----------------------------------
// DRAW
// ----------------------------------

function drawPixelCodex() {
  background(OUTER_BG);

  noStroke();
  fill(CHECKS_PANEL_BG);
  rect(renderBox.x, renderBox.y, renderBox.w, renderBox.h);

  const area = getGlyphArea();

  noStroke();
  fill(CHECKS_PANEL_BG);
  rect(area.x, area.y, area.w, area.h);

  drawBackgroundChecksGrid(area);

  const placements = buildGlyphRenderPlacements(area);
  for (const placement of placements) {
    drawGlyphTile(placement.checkObj, placement.x, placement.y, placement.w, placement.h);
  }
}

function checksHaveExactSvgLayout() {
  if (!checks.length) return false;

  return checks.every(checkObj => {
    return (
      Number.isFinite(checkObj.sourceX) &&
      Number.isFinite(checkObj.sourceY) &&
      Number.isFinite(checkObj.sourceScale)
    );
  });
}

function buildGlyphRenderPlacements(area = getGlyphArea()) {
  const placements = [];

  if (USE_EXACT_SVG_CHECK_LAYOUT && checksHaveExactSvgLayout()) {
    const panel = svgLayout?.panel || { ...FALLBACK_PANEL };

    for (const c of checks) {
      const x = renderBox.x + (c.sourceX - panel.x) * EXPORT_SCALE;
      const y = renderBox.y + (c.sourceY - panel.y) * EXPORT_SCALE;
      const s = SVG_CHECK_SIZE * c.sourceScale * EXPORT_SCALE;
      placements.push({ checkObj: c, x, y, w: s, h: s });
    }

    return placements;
  }

  const activeGrid = deriveActiveGrid();

  for (let i = 0; i < checks.length; i++) {
    const c = checks[i];
    const row = activeGrid.useOriginal ? c.row : floor(i / activeGrid.cols);
    const col = activeGrid.useOriginal ? c.col : i % activeGrid.cols;
    const tileW = area.w / activeGrid.cols;
    const tileH = area.h / activeGrid.rows;
    const x = area.x + col * tileW;
    const y = area.y + row * tileH;

    placements.push({ checkObj: c, x, y, w: tileW, h: tileH });
  }

  return placements;
}

function drawBackgroundChecksGrid(area) {
  noFill();
  stroke(CHECKS_GRID);
  strokeWeight(EXPORT_SCALE);

  const cellW = area.w / BG_GRID_COLS;
  const cellH = area.h / BG_GRID_ROWS;

  for (let r = 0; r <= BG_GRID_ROWS; r++) {
    const y = area.y + r * cellH;
    line(area.x, y, area.x + area.w, y);
  }

  for (let c = 0; c <= BG_GRID_COLS; c++) {
    const x = area.x + c * cellW;
    line(x, area.y, x, area.y + area.h);
  }
}

function computeGlyphTileGeometry(checkObj, x, y, w, h) {
  const s = min(w, h);
  const pad = s * TILE_PAD_FRAC;

  const gx = x + w / 2 - (s - pad * 2) / 2;
  const gy = y + h / 2 - (s - pad * 2) / 2;
  const gs = s - pad * 2;

  const unit = gs / GLYPH_N;
  const gap = unit * CELL_GAP_FRAC;

  const path = checkObj.path25 || rowPath();
  const fallbackOrder = uniqueSorted(checkObj.visibleIndices || []);
  const drawOrder =
    Array.isArray(checkObj.glyphTraversal) && checkObj.glyphTraversal.length
      ? checkObj.glyphTraversal
      : fallbackOrder;

  const rects = [];

  for (const index of drawOrder) {
    const pos = path[index];
    if (!pos) continue;

    const px = gx + pos.x * unit + gap / 2;
    const py = gy + pos.y * unit + gap / 2;
    const ps = unit - gap;
    const c = checkObj.visibleColorMap[index] || "#eeeeee";

    rects.push({ index, x: px, y: py, size: ps, color: c });
  }

  return { gx, gy, gs, unit, gap, rects, drawOrder };
}

function drawGlyphTile(checkObj, x, y, w, h) {
  const geometry = computeGlyphTileGeometry(checkObj, x, y, w, h);

  for (const cell of geometry.rects) {
    const x1 = Math.round(cell.x);
    const y1 = Math.round(cell.y);
    const x2 = Math.round(cell.x + cell.size);
    const y2 = Math.round(cell.y + cell.size);

    fillColor(cell.color);
    noStroke();
    rect(x1, y1, max(1, x2 - x1), max(1, y2 - y1));
  }
}

function buildGlyphsSVGDocument() {
  if (!checks.length || !renderBox) return "";

  const root = svgLayout?.root || { w: FALLBACK_ROOT_W, h: FALLBACK_ROOT_H };
  const panel = svgLayout?.panel || { ...FALLBACK_PANEL };
  const area = getGlyphAreaSVG(panel);
  const placements = buildGlyphRenderPlacements(area);
  const width = Math.round(root.w * EXPORT_SCALE);
  const height = Math.round(root.h * EXPORT_SCALE);
  const displayWidth = Math.round(root.w * SVG_DISPLAY_SCALE);
  const displayHeight = Math.round(root.h * SVG_DISPLAY_SCALE);
  const tokenLabel = /^\d+$/.test(String(loadedTokenId || ""))
    ? `Checks #${loadedTokenId}`
    : "Checks";

  const lines = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${displayWidth}" height="${displayHeight}" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">`);
  lines.push(`  <title>${escapeXML(`CheckGlyphs — ${tokenLabel}`)}</title>`);
  lines.push(`  <desc>${escapeXML("Deterministic glyph transduction generated from Checks chromatic behavior.")}</desc>`);
  lines.push(`  <rect width="${width}" height="${height}" fill="${OUTER_BG}"/>`);
  lines.push(`  <rect x="${roundNumber(panel.x * EXPORT_SCALE)}" y="${roundNumber(panel.y * EXPORT_SCALE)}" width="${roundNumber(panel.w * EXPORT_SCALE)}" height="${roundNumber(panel.h * EXPORT_SCALE)}" fill="${CHECKS_PANEL_BG}"/>`);
  lines.push(`  <g id="background-grid" stroke="${CHECKS_GRID}" stroke-width="${EXPORT_SCALE}" fill="none">`);

  const cellW = area.w / BG_GRID_COLS;
  const cellH = area.h / BG_GRID_ROWS;
  for (let r = 0; r <= BG_GRID_ROWS; r++) {
    const y = roundNumber(area.y + r * cellH);
    lines.push(`    <line x1="${roundNumber(area.x)}" y1="${y}" x2="${roundNumber(area.x + area.w)}" y2="${y}"/>`);
  }
  for (let c = 0; c <= BG_GRID_COLS; c++) {
    const x = roundNumber(area.x + c * cellW);
    lines.push(`    <line x1="${x}" y1="${roundNumber(area.y)}" x2="${x}" y2="${roundNumber(area.y + area.h)}"/>`);
  }
  lines.push('  </g>');

  lines.push('  <g id="glyphs">');
  placements.forEach((placement, index) => {
    const geometry = computeGlyphTileGeometry(placement.checkObj, placement.x, placement.y, placement.w, placement.h);
    lines.push(`    <g id="check-${index + 1}">`);
    geometry.rects.forEach(cell => {
      lines.push(`      <rect x="${roundNumber(cell.x)}" y="${roundNumber(cell.y)}" width="${roundNumber(cell.size)}" height="${roundNumber(cell.size)}" fill="${normalizeSvgColor(cell.color)}"/>`);
    });
    lines.push('    </g>');
  });
  lines.push('  </g>');
  lines.push('</svg>');

  return lines.join("\n");
}

function getGlyphAreaSVG(panel) {
  const margin = CHECKS_INNER_MARGIN * EXPORT_SCALE;
  return {
    x: panel.x * EXPORT_SCALE + margin,
    y: panel.y * EXPORT_SCALE + margin,
    w: panel.w * EXPORT_SCALE - margin * 2,
    h: panel.h * EXPORT_SCALE - margin * 2
  };
}

function normalizeSvgColor(value) {
  const raw = String(value || "").trim();

  const shortHex = raw.match(/^#([0-9a-f]{3})$/i);
  if (shortHex) {
    const [r, g, b] = shortHex[1].split("");
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }

  const fullHex = raw.match(/^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/i);
  if (fullHex) return `#${fullHex[1].toLowerCase()}`;

  const rgbMatch = raw.match(/^rgba?\(\s*([+-]?[\d.]+)\s*,\s*([+-]?[\d.]+)\s*,\s*([+-]?[\d.]+)/i);
  if (rgbMatch) {
    const channels = rgbMatch.slice(1, 4).map(channel =>
      Math.max(0, Math.min(255, Math.round(Number(channel))))
    );
    return `#${channels.map(channel => channel.toString(16).padStart(2, "0")).join("")}`;
  }

  return "#eeeeee";
}

function escapeXML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function roundNumber(value) {
  return Number(value).toFixed(4).replace(/\.?0+$/, "");
}

// ----------------------------------
// ACTIVE GRID FALLBACK
// ----------------------------------

function deriveActiveGrid() {
  const originalRows = maxGridRow() + 1;
  const originalCols = maxGridCol() + 1;

  if (
    originalRows > 1 &&
    originalCols > 1 &&
    originalRows * originalCols >= checks.length &&
    originalRows < checks.length &&
    originalCols < checks.length
  ) {
    return {
      rows: originalRows,
      cols: originalCols,
      useOriginal: true
    };
  }

  const n = checks.length;
  const aspect = renderBox.w / renderBox.h;
  const cols = ceil(sqrt(n * aspect));
  const rows = ceil(n / cols);

  return { rows, cols, useOriginal: false };
}

// ----------------------------------
// EXACT CHROMATIC TRACK
// ----------------------------------

function getExactTrack(checkObj) {
  let colors = (checkObj.rawColors || checkObj.colors || []).filter(isUsableColor);
  let keyTimes = (checkObj.rawKeyTimes || []).slice();

  if (!colors.length) {
    colors = ["#eeeeee", "#eeeeee"];
    keyTimes = [0, 1];
  }

  if (colors.length === 1) {
    colors = [colors[0], colors[0]];
    keyTimes = [0, 1];
  }

  if (keyTimes.length !== colors.length) {
    keyTimes = [];

    for (let i = 0; i < colors.length; i++) {
      keyTimes.push(i / max(1, colors.length - 1));
    }
  }

  for (let i = 0; i < keyTimes.length; i++) {
    keyTimes[i] = constrain(keyTimes[i], 0, 1);
  }

  for (let i = 1; i < keyTimes.length; i++) {
    if (keyTimes[i] < keyTimes[i - 1]) {
      keyTimes[i] = keyTimes[i - 1];
    }
  }

  return { colors, keyTimes };
}

function computeExactTrackSignature(checkObj) {
  const track = getExactTrack(checkObj);

  const colorPart = track.colors
    .map(c => normalizeColorKey(c))
    .join("-");

  const timePart = track.keyTimes
    .map(t => Number(t).toFixed(6))
    .join("-");

  return colorPart + "|times:" + timePart;
}

function sampleColorAtTime(colors, keyTimes, t) {
  if (!colors.length) return "#eeeeee";
  if (colors.length === 1) return colors[0];

  const tt = constrain(t, 0, 1);

  if (tt <= keyTimes[0]) return colors[0];
  if (tt >= keyTimes[keyTimes.length - 1]) return colors[colors.length - 1];

  for (let i = 0; i < keyTimes.length - 1; i++) {
    const t0 = keyTimes[i];
    const t1 = keyTimes[i + 1];

    if (tt >= t0 && tt <= t1) {
      const denom = max(0.000001, t1 - t0);
      const localT = constrain((tt - t0) / denom, 0, 1);

      return lerpColorString(colors[i], colors[i + 1], localT);
    }
  }

  return colors[colors.length - 1];
}

// ----------------------------------
// STYLE
// ----------------------------------

function fillColor(c) {
  const rgb = colorToRGB(c);

  if (!rgb) {
    fill("#eeeeee");
    return;
  }

  fill(rgb.r, rgb.g, rgb.b, 255);
}

// ----------------------------------
// LAYOUT
// ----------------------------------

function setupCanvasFromLayout() {
  const root = svgLayout?.root || { w: FALLBACK_ROOT_W, h: FALLBACK_ROOT_H };
  const panel = svgLayout?.panel || { ...FALLBACK_PANEL };

  resizeCanvas(
    Math.round(root.w * EXPORT_SCALE),
    Math.round(root.h * EXPORT_SCALE)
  );

  renderBox = {
    x: Math.round(panel.x * EXPORT_SCALE),
    y: Math.round(panel.y * EXPORT_SCALE),
    w: Math.round(panel.w * EXPORT_SCALE),
    h: Math.round(panel.h * EXPORT_SCALE)
  };
}

function getGlyphArea() {
  const margin = CHECKS_INNER_MARGIN * EXPORT_SCALE;

  return {
    x: renderBox.x + margin,
    y: renderBox.y + margin,
    w: renderBox.w - margin * 2,
    h: renderBox.h - margin * 2
  };
}

function drawEmptyState() {
  background(OUTER_BG);

  const bx = FALLBACK_PANEL.x * EXPORT_SCALE;
  const by = FALLBACK_PANEL.y * EXPORT_SCALE;
  const bw = FALLBACK_PANEL.w * EXPORT_SCALE;
  const bh = FALLBACK_PANEL.h * EXPORT_SCALE;

  noStroke();
  fill(CHECKS_PANEL_BG);
  rect(bx, by, bw, bh);

  const margin = CHECKS_INNER_MARGIN * EXPORT_SCALE;
  const area = {
    x: bx + margin,
    y: by + margin,
    w: bw - margin * 2,
    h: bh - margin * 2
  };

  noStroke();
  fill(CHECKS_PANEL_BG);
  rect(area.x, area.y, area.w, area.h);

  drawBackgroundChecksGrid(area);

}

// ----------------------------------
// SVG PARSING
// ----------------------------------

function extractChecksLayout(doc) {
  const svg = doc.querySelector("svg");
  const root = extractRootSize(svg);

  let panel = null;

  if (svg) {
    const rects = Array.from(svg.children).filter(el => {
      return el.tagName && el.tagName.toLowerCase() === "rect";
    });

    for (const r of rects) {
      const x = parseFloat(r.getAttribute("x") || "0") || 0;
      const y = parseFloat(r.getAttribute("y") || "0") || 0;
      const w = parseFloat(r.getAttribute("width") || "0") || 0;
      const h = parseFloat(r.getAttribute("height") || "0") || 0;
      const fill = (r.getAttribute("fill") || "").trim();

      if (!w || !h) continue;
      if (!fill || fill === "none" || fill === "transparent") continue;

      if (w < root.w && h < root.h) {
        if (!panel || w * h > panel.w * panel.h) {
          panel = { x, y, w, h };
        }
      }
    }
  }

  if (!panel) panel = { ...FALLBACK_PANEL };

  return { root, panel };
}

function extractRootSize(svg) {
  if (!svg) {
    return { w: FALLBACK_ROOT_W, h: FALLBACK_ROOT_H };
  }

  const vb = svg.getAttribute("viewBox");

  if (vb) {
    const parts = vb.trim().split(/\s+/).map(Number);

    if (parts.length === 4) {
      return { w: parts[2], h: parts[3] };
    }
  }

  const w =
    parseFloat(svg.getAttribute("width") || FALLBACK_ROOT_W) ||
    FALLBACK_ROOT_W;

  const h =
    parseFloat(svg.getAttribute("height") || FALLBACK_ROOT_H) ||
    FALLBACK_ROOT_H;

  return { w, h };
}

function extractChecks(doc) {
  const found = [];
  const uses = Array.from(doc.querySelectorAll("use"));

  for (const useEl of uses) {
    const href =
      useEl.getAttribute("href") ||
      useEl.getAttribute("xlink:href") ||
      useEl.getAttributeNS("http://www.w3.org/1999/xlink", "href");

    if (href !== "#check") continue;

    const parentG = nearestParentG(useEl);

    const animate = findFillAnimationForUse(useEl, parentG);
    const fill =
      useEl.getAttribute("fill") ||
      (parentG ? parentG.getAttribute("fill") : null);
    const initialFill = isUsableColor(fill) ? fill : "";

    let colors = [];
    let keyTimes = [];

    if (animate) {
      colors = parseColorValues(animate.getAttribute("values"));
      keyTimes = parseKeyTimes(animate.getAttribute("keyTimes"), colors.length);
    }

    if (!colors.length && initialFill) {
      colors = [initialFill, initialFill];
      keyTimes = [0, 1];
    }

    if (!colors.length) continue;

    const pos = extractApproxPosition(useEl, parentG);

    found.push({
      x: pos.x,
      y: pos.y,

      sourceX: pos.x,
      sourceY: pos.y,
      sourceScale: pos.scale,

      row: 0,
      col: 0,

      colors,
      keyTimes,
      rawColors: [...colors],
      rawKeyTimes: [...keyTimes],
      initialFill,

      rawOrder: found.length,

      exactSignature: "",
      metrics: null,

      path25: null,
      visibleIndices: [],
      hiddenIndices: [],
      visibleColorMap: {},
      glyphFamilyId: "",
      inflectionId: "",
      glyphProfile: null,
      identity: null,
      glyphDNA: null,
      glyphOriginIndex: null,
      glyphTraversal: [],
      glyphCollisionAttempt: 0
    });
  }

  return found;
}

function findFillAnimationForUse(useEl, parentG) {
  // Official Checks SVGs nest the fill animation directly inside their <use>.
  // Prefer that exact relationship and never borrow the first animation from a
  // group containing several Checks, which could cross-wire color tracks.
  const directNested = Array.from(useEl.children || []).find(el =>
    String(el.localName || el.tagName || "").toLowerCase() === "animate" &&
    el.getAttribute("attributeName") === "fill"
  );
  const nested =
    directNested || useEl.querySelector('animate[attributeName="fill"]');

  if (nested) return nested;
  if (!parentG) return null;

  const siblingUses = Array.from(parentG.querySelectorAll("use")).filter(el => {
    const href =
      el.getAttribute("href") ||
      el.getAttribute("xlink:href") ||
      el.getAttributeNS("http://www.w3.org/1999/xlink", "href");
    return href === "#check";
  });

  // Safe legacy fallback only when the group represents one Check.
  if (siblingUses.length === 1) {
    const directParentAnimation = Array.from(parentG.children || []).find(el =>
      String(el.localName || el.tagName || "").toLowerCase() === "animate" &&
      el.getAttribute("attributeName") === "fill"
    );
    return (
      directParentAnimation ||
      parentG.querySelector('animate[attributeName="fill"]')
    );
  }

  return null;
}

function nearestParentG(el) {
  let p = el.parentElement;

  while (p && p.tagName && p.tagName.toLowerCase() !== "svg") {
    if (p.tagName.toLowerCase() === "g") return p;
    p = p.parentElement;
  }

  return null;
}

function extractApproxPosition(useEl, parentG) {
  let x = parseFloat(useEl.getAttribute("x") || "0") || 0;
  let y = parseFloat(useEl.getAttribute("y") || "0") || 0;
  let scale = 1;

  let el = parentG || useEl.parentElement;

  while (el && el.tagName && el.tagName.toLowerCase() !== "svg") {
    const tr = el.getAttribute("transform");

    if (tr) {
      const t = parseTransformInfo(tr);

      x = t.x + x * t.scale;
      y = t.y + y * t.scale;
      scale *= t.scale;
    }

    el = el.parentElement;
  }

  return { x, y, scale };
}

function parseTransformInfo(transformString) {
  const out = { x: 0, y: 0, scale: 1 };

  if (!transformString) return out;

  const translate = transformString.match(
    /translate\s*\(\s*([-\d.]+)(?:[\s,]+([-\d.]+))?/i
  );

  if (translate) {
    out.x += parseFloat(translate[1]) || 0;
    out.y += parseFloat(translate[2] || "0") || 0;
  }

  const scale = transformString.match(
    /scale\s*\(\s*([-\d.]+)(?:[\s,]+([-\d.]+))?\s*\)/i
  );

  if (scale) {
    out.scale *= parseFloat(scale[1]) || 1;
  }

  const matrix = transformString.match(
    /matrix\s*\(\s*([-\d.]+)[\s,]+([-\d.]+)[\s,]+([-\d.]+)[\s,]+([-\d.]+)[\s,]+([-\d.]+)[\s,]+([-\d.]+)\s*\)/i
  );

  if (matrix) {
    const a = parseFloat(matrix[1]) || 1;
    const b = parseFloat(matrix[2]) || 0;
    const e = parseFloat(matrix[5]) || 0;
    const f = parseFloat(matrix[6]) || 0;

    out.x += e;
    out.y += f;
    out.scale *= Math.sqrt(a * a + b * b);
  }

  return out;
}

function assignApproxGridCoordinates(arr) {
  const rows = [];
  const rowTolerance = 2;

  for (const c of arr) {
    let rowIndex = rows.findIndex(r => Math.abs(r.y - c.y) <= rowTolerance);

    if (rowIndex < 0) {
      rows.push({ y: c.y, items: [] });
      rowIndex = rows.length - 1;
    }

    rows[rowIndex].items.push(c);
  }

  rows.sort((a, b) => a.y - b.y);

  for (let r = 0; r < rows.length; r++) {
    rows[r].items.sort((a, b) => a.x - b.x);

    for (let col = 0; col < rows[r].items.length; col++) {
      rows[r].items[col].row = r;
      rows[r].items[col].col = col;
    }
  }
}

// ----------------------------------
// METRICS
// ----------------------------------

function computeMetrics(checkObj) {
  const rawTrackColors = (checkObj.rawColors || checkObj.colors || []).filter(isUsableColor);
  const colors = getCanonicalColors(checkObj.colors);
  const unique = uniqueColorList(colors);

  let sumDelta = 0;
  let count = 0;

  for (let i = 1; i < colors.length; i++) {
    const a = colorToLab(colors[i - 1]);
    const b = colorToLab(colors[i]);

    if (!a || !b) continue;

    sumDelta += labDistance(a, b);
    count++;
  }

  let returnsToOrigin = false;

  if (rawTrackColors.length >= 2) {
    returnsToOrigin = colorsAlmostEqual(
      rawTrackColors[0],
      rawTrackColors[rawTrackColors.length - 1]
    );
  }

  return {
    uniqueCount: unique.length,
    meanDelta: count ? sumDelta / count : 0,
    returnsToOrigin,
    colorOffset: hashString(computeColorWord(colors)) % max(1, colors.length)
  };
}

// ----------------------------------
// COLOR UTILS
// ----------------------------------

function parseColorValues(values) {
  if (!values) return [];

  return values
    .split(";")
    .map(s => s.trim())
    .filter(Boolean)
    .filter(isUsableColor);
}

function parseKeyTimes(keyTimes, count) {
  if (!keyTimes || !count) return [];

  const arr = String(keyTimes)
    .split(";")
    .map(s => parseFloat(s.trim()))
    .filter(v => Number.isFinite(v));

  if (arr.length !== count) return [];

  return arr.map(v => constrain(v, 0, 1));
}

function isUsableColor(c) {
  if (!c) return false;

  const s = String(c).trim();

  if (s === "none" || s === "transparent" || s === "currentColor") {
    return false;
  }

  if (/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s)) return true;
  if (/^(rgb|rgba|hsl|hsla)\(/i.test(s)) return true;
  if (/^[a-z]+$/i.test(s)) return true;

  return false;
}

function getCanonicalColors(colors) {
  let clean = (colors || []).filter(isUsableColor);

  if (clean.length > 2 && colorsAlmostEqual(clean[0], clean[clean.length - 1])) {
    clean = clean.slice(0, -1);
  }

  if (FILTER_NEAR_BLACK_FROM_COLOR_SAMPLES) {
    const nonBlack = clean.filter(c => !isNearBlackColor(c));

    if (nonBlack.length > 0) clean = nonBlack;
  }

  return clean;
}

function isNearBlackColor(c) {
  const rgb = colorToRGB(c);
  if (!rgb) return false;

  const luma = rgb.r * 0.2126 + rgb.g * 0.7152 + rgb.b * 0.0722;
  return luma < NEAR_BLACK_LUMA_CUTOFF;
}

function computeColorWord(colors) {
  const clean = getCanonicalColors(colors);
  const out = [];

  for (const c of clean) {
    const key = normalizeColorKey(c);

    if (!out.length || out[out.length - 1] !== key) {
      out.push(key);
    }
  }

  return out.join("-");
}

function uniqueColorList(arr) {
  const out = [];

  for (const c of arr) {
    if (!out.some(x => colorsAlmostEqual(x, c))) {
      out.push(c);
    }
  }

  return out;
}

function lerpColorString(a, b, t) {
  const ca = colorToRGB(a);
  const cb = colorToRGB(b);

  if (!ca || !cb) {
    return a || b || "#eeeeee";
  }

  const r = round(lerp(ca.r, cb.r, t));
  const g = round(lerp(ca.g, cb.g, t));
  const bl = round(lerp(ca.b, cb.b, t));

  return `rgb(${r},${g},${bl})`;
}

function colorToRGB(c) {
  try {
    const pc = color(c);

    return {
      r: round(red(pc)),
      g: round(green(pc)),
      b: round(blue(pc))
    };
  } catch (e) {
    return null;
  }
}

function normalizeColorKey(c) {
  const rgb = colorToRGB(c);

  if (!rgb) return String(c).trim().toLowerCase();

  return (
    rgb.r.toString(16).padStart(2, "0") +
    rgb.g.toString(16).padStart(2, "0") +
    rgb.b.toString(16).padStart(2, "0")
  );
}

function colorsAlmostEqual(a, b) {
  const ca = colorToRGB(a);
  const cb = colorToRGB(b);

  if (!ca || !cb) {
    return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
  }

  const d =
    abs(ca.r - cb.r) +
    abs(ca.g - cb.g) +
    abs(ca.b - cb.b);

  return d <= 2;
}

// ----------------------------------
// LAB DISTANCE
// ----------------------------------

function colorToLab(c) {
  const rgb = colorToRGB(c);
  if (!rgb) return null;

  return rgbToLab(rgb.r, rgb.g, rgb.b);
}

function rgbToLab(r, g, b) {
  let R = srgbToLinear(r);
  let G = srgbToLinear(g);
  let B = srgbToLinear(b);

  let X = R * 0.4124564 + G * 0.3575761 + B * 0.1804375;
  let Y = R * 0.2126729 + G * 0.7151522 + B * 0.0721750;
  let Z = R * 0.0193339 + G * 0.1191920 + B * 0.9503041;

  X /= 0.95047;
  Y /= 1.00000;
  Z /= 1.08883;

  const fx = labF(X);
  const fy = labF(Y);
  const fz = labF(Z);

  return {
    L: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz)
  };
}

function srgbToLinear(v) {
  v /= 255;
  if (v <= 0.04045) return v / 12.92;
  return pow((v + 0.055) / 1.055, 2.4);
}

function labF(t) {
  const e = 216 / 24389;
  const k = 24389 / 27;

  if (t > e) return Math.cbrt(t);

  return (k * t + 16) / 116;
}

function labDistance(a, b) {
  const dL = a.L - b.L;
  const da = a.a - b.a;
  const db = a.b - b.b;

  return sqrt(dL * dL + da * da + db * db);
}

// ----------------------------------
// PATH / ORDER
// ----------------------------------

function rowPath() {
  const path = [];

  for (let y = 0; y < GLYPH_N; y++) {
    for (let x = 0; x < GLYPH_N; x++) {
      path.push({ x, y });
    }
  }

  return path;
}

// ----------------------------------
// GENERAL UTILS
// ----------------------------------

function maxGridRow() {
  let m = 0;

  for (const c of checks) {
    if (c.row > m) m = c.row;
  }

  return max(1, m);
}

function maxGridCol() {
  let m = 0;

  for (const c of checks) {
    if (c.col > m) m = c.col;
  }

  return max(1, m);
}

function hashString(str) {
  str = String(str || "");

  let h = 2166136261;

  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }

  return h >>> 0;
}

function hash01(str) {
  return (hashString(str) % 1000000) / 1000000;
}

function uniqueSorted(arr) {
  return Array.from(new Set(arr)).sort((a, b) => a - b);
}

function shuffleStable(arr, seed) {
  const out = arr.slice();

  for (let i = out.length - 1; i > 0; i--) {
    const j = floor(hash01(seed + ":" + i) * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }

  return out;
}

function resetAll() {
  checks = [];
  svgLayout = null;
  renderBox = null;
  loadedTokenId = "";
  loadedSourceState = "active";
  loadedTraits = {
    speed: "unknown",
    shift: "unknown",
    gradient: "unknown",
    all: {}
  };

  resizeCanvas(FALLBACK_ROOT_W * EXPORT_SCALE, FALLBACK_ROOT_H * EXPORT_SCALE);
  noLoop();
  drawEmptyState();
  resetPresentation();
  setStatus("ENTER A CHECKS TOKEN ID.");
}

// ----------------------------------
// KEYS
// ----------------------------------

function keyPressed() {
  const active = document.activeElement;
  const isTyping =
    active &&
    (active.tagName === "INPUT" || active.tagName === "TEXTAREA");

  if (isTyping) return;

  if (key === "s" || key === "S") {
    saveCurrentGlyphs();
  }
}
