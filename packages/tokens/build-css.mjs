import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const tokens = JSON.parse(await readFile(new URL("./tokens.json", import.meta.url), "utf8"));

function pluginBlock() {
  const lines = [
    "/* Generated from packages/tokens/tokens.json.",
    "   Accent fallback is the brand indigo #5B5BD6 / #8B8DF5. Obsidian's --interactive-accent wins when set.",
    "   Other surfaces follow the default theme's --color-base-* and status palette. */",
    ".labsidian {",
  ];
  for (const [name, token] of Object.entries(tokens.color)) {
    lines.push(`  --lab-${name}: var(${token.obsidian}, ${token.light});`);
  }
  for (const [name, token] of Object.entries(tokens.status)) {
    lines.push(`  --lab-${name}: var(${token.obsidian}, ${token.light});`);
  }
  for (const [name, token] of Object.entries(tokens.source)) {
    lines.push(`  --lab-source-${name}: var(${token.obsidian}, ${token.light});`);
  }
  lines.push(`  --lab-font-sans: var(${tokens.font.sans.obsidian}, ${tokens.font.sans.web});`);
  lines.push(`  --lab-font-mono: var(${tokens.font.mono.obsidian}, ${tokens.font.mono.web});`);
  for (const [name, value] of Object.entries(tokens.font.size)) {
    lines.push(`  --lab-size-${name}: ${value};`);
  }
  for (const [name, value] of Object.entries(tokens.font.weight)) {
    lines.push(`  --lab-weight-${name}: ${value};`);
  }
  for (const [name, value] of Object.entries(tokens.space)) {
    lines.push(`  --lab-space-${name}: ${value};`);
  }
  for (const [name, token] of Object.entries(tokens.radius)) {
    const fallback = token.web;
    lines.push(
      token.obsidian
        ? `  --lab-radius-${name}: var(${token.obsidian}, ${fallback});`
        : `  --lab-radius-${name}: ${fallback};`,
    );
  }
  lines.push(`  --lab-shadow-modal: ${tokens.shadow.modal};`);
  lines.push("}");
  return lines.join("\n") + "\n";
}

function webBlock() {
  const light = [];
  const dark = [];
  const pushPair = (name, token) => {
    light.push(`  --lab-${name}: ${token.light};`);
    dark.push(`  --lab-${name}: ${token.dark};`);
  };
  for (const [name, token] of Object.entries(tokens.color)) pushPair(name, token);
  for (const [name, token] of Object.entries(tokens.status)) pushPair(name, token);
  for (const [name, token] of Object.entries(tokens.source)) pushPair(`source-${name}`, token);
  light.push(`  --lab-font-sans: ${tokens.font.sans.web};`);
  dark.push(`  --lab-font-sans: ${tokens.font.sans.web};`);
  light.push(`  --lab-font-mono: ${tokens.font.mono.web};`);
  dark.push(`  --lab-font-mono: ${tokens.font.mono.web};`);
  for (const [name, value] of Object.entries(tokens.font.size)) {
    light.push(`  --lab-size-${name}: ${value};`);
    dark.push(`  --lab-size-${name}: ${value};`);
  }
  for (const [name, value] of Object.entries(tokens.space)) {
    light.push(`  --lab-space-${name}: ${value};`);
    dark.push(`  --lab-space-${name}: ${value};`);
  }
  for (const [name, token] of Object.entries(tokens.radius)) {
    light.push(`  --lab-radius-${name}: ${token.web};`);
    dark.push(`  --lab-radius-${name}: ${token.web};`);
  }
  light.push(`  --lab-shadow-modal: ${tokens.shadow.modal};`);
  dark.push(`  --lab-shadow-modal: ${tokens.shadow.modal};`);

  const theme = [];
  theme.push("  --color-lab-accent: var(--lab-accent);");
  theme.push("  --color-lab-accent-hover: var(--lab-accent-hover);");
  theme.push("  --color-lab-on-accent: var(--lab-on-accent);");
  theme.push("  --color-lab-bg: var(--lab-bg);");
  theme.push("  --color-lab-bg-subtle: var(--lab-bg-subtle);");
  theme.push("  --color-lab-bg-hover: var(--lab-bg-hover);");
  theme.push("  --color-lab-border: var(--lab-border);");
  theme.push("  --color-lab-text: var(--lab-text);");
  theme.push("  --color-lab-text-muted: var(--lab-text-muted);");
  theme.push("  --color-lab-text-faint: var(--lab-text-faint);");
  for (const name of Object.keys(tokens.status)) {
    theme.push(`  --color-lab-${name}: var(--lab-${name});`);
  }
  for (const name of Object.keys(tokens.source)) {
    theme.push(`  --color-lab-source-${name}: var(--lab-source-${name});`);
  }
  theme.push("  --font-lab: var(--lab-font-sans);");
  theme.push("  --font-lab-mono: var(--lab-font-mono);");
  theme.push("  --radius-lab-s: var(--lab-radius-s);");
  theme.push("  --radius-lab-m: var(--lab-radius-m);");
  theme.push("  --radius-lab-l: var(--lab-radius-l);");
  theme.push("  --radius-lab-pill: var(--lab-radius-pill);");

  return [
    "/* Generated from packages/tokens/tokens.json. Fixed light/dark values, not Obsidian variables. */",
    ":root {",
    light.join("\n"),
    "}",
    "@media (prefers-color-scheme: dark) {",
    "  :root:not(.light) {",
    dark.join("\n"),
    "  }",
    "}",
    ".dark {",
    dark.join("\n"),
    "}",
    "@theme inline {",
    theme.join("\n"),
    "}",
    "",
  ].join("\n");
}

const pluginVars = pluginBlock();
const components = await readFile(join(root, "src/ui/components.css"), "utf8");
await writeFile(join(root, "packages/tokens/plugin.css"), pluginVars);
await writeFile(join(root, "styles.css"), `${pluginVars}\n${components}`);
await writeFile(join(root, "briefing/app/web.css"), webBlock());
console.log("tokens: styles.css, packages/tokens/plugin.css, briefing/app/web.css");
