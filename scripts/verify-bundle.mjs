import { readFile } from "node:fs/promises";
import { builtinModules } from "node:module";
import { createRequire } from "node:module";

const code = await readFile(new URL("../main.js", import.meta.url), "utf8");
const checks = [
  ["bundled cmap", code.includes("CMap 없음")],
  ["kordoc parse path", code.includes("pdfjs") || code.includes("getDocument") || code.includes("PDF")],
];
for (const [name, ok] of checks) {
  if (!ok) {
    console.error(`bundle check failed: ${name}`);
    process.exit(1);
  }
}
// Patterns the Obsidian community scanner flags. esbuild.config.mjs replaces their sources.
const flagged = [
  ['createElement("script")', "injects script elements"],
  ['require("child_process")', "can run shell commands"],
  ['require("fs")', "reads files outside the vault API"],
  ['require("fs/promises")', "reads files outside the vault API"],
  ["new Function(", "generates code at runtime"],
];
for (const [pattern, why] of flagged) {
  if (code.includes(pattern)) {
    console.error(`bundle contains ${pattern} (${why})`);
    process.exit(1);
  }
}
if (code.includes("BEGIN PRIVATE KEY") || code.includes("sk-live")) {
  console.error("bundle contains a secret-like string");
  process.exit(1);
}
const maxBytes = 4.5 * 1024 * 1024;
if (code.length > maxBytes) {
  console.error(`bundle is ${code.length} bytes, over the ${maxBytes} byte cap`);
  process.exit(1);
}
if (code.includes("\0asm") || code.includes('.node"') || code.includes(".node'")) {
  console.error("bundle contains a wasm or native .node binary");
  process.exit(1);
}
// Load main.js the way Obsidian does: wrapped in a function, no __filename, and only
// "obsidian" + Node builtins resolvable. Any other require means a dependency was left unbundled.
const builtins = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`), "electron"]);
const nodeRequire = createRequire(import.meta.url);
const obsidianStub = new Proxy({}, { get: (_target, key) => (key === "__esModule" ? false : class {}) });
const sandboxRequire = (name) => {
  if (name === "obsidian") return obsidianStub;
  if (builtins.has(name)) return nodeRequire(name);
  throw new Error(`Cannot find module '${name}' (not bundled; the plugin folder has no node_modules)`);
};
const loaded = { exports: {} };
try {
  new Function("require", "module", "exports", code)(sandboxRequire, loaded, loaded.exports);
} catch (error) {
  console.error(`bundle failed to load like Obsidian: ${error.message}`);
  process.exit(1);
}
if (typeof (loaded.exports.default ?? loaded.exports) !== "function") {
  console.error("bundle loaded but exports no plugin class");
  process.exit(1);
}
const megabytes = code.length / (1024 * 1024);
console.log(`bundle ok (${megabytes.toFixed(2)}MB)`);
