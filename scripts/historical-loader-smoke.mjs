import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const engine = await readFile(resolve(root, "src/checkglyphs.js"), "utf8");

const quietConsole = { ...console, warn: () => {} };

const context = vm.createContext({
  console: quietConsole,
  Math,
  Number,
  String,
  BigInt,
  TextEncoder,
  TextDecoder,
  Uint8Array,
  setTimeout,
  clearTimeout
});

vm.runInContext(
  `${engine}
function __encodeAbiStringForSmoke(value) {
  const bytes = new TextEncoder().encode(String(value));
  const data = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
  const offset = "20".padStart(64, "0");
  const length = bytes.length.toString(16).padStart(64, "0");
  const padded = data.padEnd(Math.ceil(data.length / 64) * 64, "0");
  return "0x" + offset + length + padded;
}

async function __runHistoricalSmoke(svgText) {
  const originalBuildRPCList = buildRPCList;
  const originalEthCall = ethCall;
  const originalGetSelector = getSvgFunctionSelector;

  buildRPCList = () => ["mock://rpc"];
  getSvgFunctionSelector = async () => "0x12345678";
  ethCall = async (_rpc, _to, data) => {
    if (String(data).startsWith(TOKEN_URI_SELECTOR)) {
      throw new Error("execution reverted");
    }
    return __encodeAbiStringForSmoke(svgText);
  };

  try {
    const source = await fetchCheckSourceFromContract("16");
    return { state: source.state, hasSvg: source.svgText.includes("<svg") };
  } catch (error) {
    return { errorCode: error.code || "UNKNOWN" };
  } finally {
    buildRPCList = originalBuildRPCList;
    ethCall = originalEthCall;
    getSvgFunctionSelector = originalGetSelector;
  }
}

globalThis.__historicalSmokePromise = (async () => {
  const historical = await __runHistoricalSmoke(
    '<svg><defs><g id="check"/></defs><use href="#check"><animate attributeName="fill" values="#fff;#000"/></use></svg>'
  );
  const neverMigrated = await __runHistoricalSmoke(
    '<svg><defs><g id="check"/></defs><use href="#check" fill="#424242"/></svg>'
  );
  return { historical, neverMigrated };
})();`,
  context,
  { filename: "checkglyphs.js" }
);

const result = await context.__historicalSmokePromise;

if (result.historical.state !== "historical" || !result.historical.hasSvg) {
  throw new Error(`Historical Original fallback failed: ${JSON.stringify(result.historical)}`);
}

if (result.neverMigrated.errorCode !== "NOT_ORIGINAL") {
  throw new Error(`Never-migrated ID guard failed: ${JSON.stringify(result.neverMigrated)}`);
}

console.log("Historical Original loader smoke test passed.");
