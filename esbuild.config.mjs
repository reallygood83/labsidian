import esbuild from "esbuild";
import { readdir, readFile } from "node:fs/promises";
import { builtinModules } from "node:module";
import path from "node:path";
import process from "node:process";

const prod = process.argv[2] === "production";
const optional = [
  "sharp",
  "onnxruntime-node",
  "canvas",
  "@napi-rs/canvas",
  "@hyzyla/pdfium",
  "@huggingface/transformers",
  "@huggingface/tokenizers",
  "puppeteer-core",
  "@modelcontextprotocol/sdk",
  "@rhwp/core",
  "libheif-js",
  "zxing-wasm",
];

const CMAP_BLOCK =
  /try \{\r?\n {2}const _require = createRequire\(import\.meta\.url\);\r?\n {2}const pkgDir = dirname\(_require\.resolve\("pdfjs-dist\/package\.json"\)\);\r?\n {2}pdfjsAssets\.cMapUrl = join\(pkgDir, "cmaps"\) \+ "\/";\r?\n {2}pdfjsAssets\.cMapPacked = true;\r?\n {2}pdfjsAssets\.standardFontDataUrl = join\(pkgDir, "standard_fonts"\) \+ "\/";\r?\n\} catch \{\r?\n\}/;

const CFB_REQUIRE = /\brequire\d*\("cfb"\)/;
const CFB_REQUIRE_ALL = /\brequire\d*\("cfb"\)/g;
const CFB_IMPORT = `import * as __labsidianCfbNs from "cfb";\nconst __labsidianCfb = __labsidianCfbNs.default ?? __labsidianCfbNs;`;

async function assetModule() {
  const root = path.join(process.cwd(), "node_modules", "pdfjs-dist");
  const cmaps = await loadDir(path.join(root, "cmaps"), ".bcmap");
  const fonts = await loadDir(path.join(root, "standard_fonts"));
  return `
const CMAPS = ${JSON.stringify(cmaps)};
const FONTS = ${JSON.stringify(fonts)};
function bytes(value) { return Buffer.from(value, "base64"); }
export class LabsidianCMapReaderFactory {
  async fetch({ name }) {
    const packed = CMAPS[name];
    if (!packed) throw new Error("CMap 없음: " + name);
    return { cMapData: bytes(packed), isCompressed: true };
  }
}
export class LabsidianStandardFontDataFactory {
  async fetch({ filename }) {
    const packed = FONTS[filename];
    if (!packed) throw new Error("글꼴 없음: " + filename);
    return bytes(packed);
  }
}
`;
}

const SKIP_CMAP = /^(UniJIS|UniGB|UniCNS|Adobe-GB1|Adobe-Japan1|Adobe-CNS1)/;
const SKIP_FONT = /^(Liberation|LICENSE)/;

async function loadDir(dir, suffix = "") {
  const entries = await readdir(dir);
  const out = {};
  for (const name of entries) {
    if (name.startsWith(".")) continue;
    if (SKIP_CMAP.test(name) || SKIP_FONT.test(name)) continue;
    const key = suffix && name.endsWith(suffix) ? name.slice(0, -suffix.length) : name;
    out[key] = (await readFile(path.join(dir, name))).toString("base64");
  }
  return out;
}

const pdfAssets = {
  name: "labsidian-pdf-assets",
  setup(build) {
    build.onResolve({ filter: /^kordoc$/ }, async (args) => {
      if (args.pluginData?.labsidianResolved) return undefined;
      const result = await build.resolve(args.path, {
        resolveDir: args.resolveDir,
        kind: args.kind,
        pluginData: { labsidianResolved: true },
      });
      if (result.errors.length > 0) return result;
      return { path: result.path, sideEffects: false };
    });
    build.onResolve({ filter: /^\.\.?\// }, (args) => {
      if (!args.resolveDir.includes(`${path.sep}kordoc${path.sep}dist${path.sep}`)) return undefined;
      return { path: path.resolve(args.resolveDir, args.path), sideEffects: false };
    });
    build.onResolve({ filter: /^labsidian-pdf-assets$/ }, () => ({ path: "labsidian-pdf-assets", namespace: "labsidian-pdf" }));
    build.onLoad({ filter: /.*/, namespace: "labsidian-pdf" }, async () => ({ contents: await assetModule(), loader: "js", resolveDir: process.cwd() }));
    build.onLoad({ filter: /kordoc[\\/]dist[\\/].*\.js$/ }, async (args) => {
      const raw = await readFile(args.path, "utf8");
      const hasCfb = CFB_REQUIRE.test(raw);
      if (!CMAP_BLOCK.test(raw) && !hasCfb) return undefined;
      // kordoc loads cfb through createRequire(import.meta.url), which esbuild leaves external.
      // The plugin folder has no node_modules, so swap it for a static import that gets bundled.
      const original = hasCfb ? `${CFB_IMPORT}\n${raw.replace(CFB_REQUIRE_ALL, "__labsidianCfb")}` : raw;
      if (!CMAP_BLOCK.test(original)) return { contents: original, loader: "js", resolveDir: path.dirname(args.path) };
      const contents = `import { LabsidianCMapReaderFactory as __labsidianCMapReaderFactory, LabsidianStandardFontDataFactory as __labsidianStandardFontFactory } from "labsidian-pdf-assets";\n${original.replace(
        CMAP_BLOCK,
        `pdfjsAssets.useWorkerFetch = false;
pdfjsAssets.cMapPacked = true;
pdfjsAssets.CMapReaderFactory = __labsidianCMapReaderFactory;
pdfjsAssets.StandardFontDataFactory = __labsidianStandardFontFactory;`,
      )}`;
      return { contents, loader: "js", resolveDir: path.dirname(args.path) };
    });
  },
};

const stubs = {
  name: "optional-native-stubs",
  setup(build) {
    const filter = new RegExp(`^(${optional.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})$`);
    build.onResolve({ filter }, (args) => ({ path: args.path, namespace: "labsidian-stub" }));
    // kordoc loads every optional module lazily inside a promise and falls back when the
    // import fails. Throw like a missing package does. A Proxy object looked "installed"
    // but had no real exports, so `mod.PDFiumLibrary.init()` crashed every PDF with large images.
    build.onLoad({ filter: /.*/, namespace: "labsidian-stub" }, (args) => ({
      contents: `const error = new Error("Cannot find module '${args.path}' (Research Shelf does not bundle this optional native module)"); error.code = "MODULE_NOT_FOUND"; throw error;`,
      loader: "js",
    }));
  },
};

await esbuild.build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  outfile: "main.js",
  format: "cjs",
  target: "es2022",
  platform: "node",
  external: ["obsidian", "electron", ...builtinModules, ...builtinModules.map((name) => `node:${name}`)],
  plugins: [pdfAssets, stubs],
  define: { "import.meta.url": "__labsidianImportMetaUrl" },
  banner: {
    js: `const __labsidianImportMetaUrl = typeof __filename === "string" ? require("url").pathToFileURL(__filename).href : "file:///labsidian/main.js";`,
  },
  minify: prod,
  legalComments: "none",
  charset: "utf8",
  logLevel: "info",
});
