import { readFile } from "node:fs/promises";

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
if (code.includes("BEGIN PRIVATE KEY") || code.includes("sk-live")) {
  console.error("bundle contains a secret-like string");
  process.exit(1);
}
console.log(`bundle ok (${Math.round(code.length / 1024)}KB)`);
