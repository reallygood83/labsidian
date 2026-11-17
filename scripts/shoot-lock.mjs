import { readFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "../briefing/node_modules/@playwright/test/index.mjs";

const fixture = await readFile(new URL("../briefing/public/lock-fixture.json", import.meta.url), "utf8");
const images = new URL("../docs/images/", import.meta.url);
await mkdir(images, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 760 } });
await page.route("**/lock-fixture.json", (route) => route.fulfill({
  status: 200,
  contentType: "application/json",
  body: fixture,
}));
await page.goto("http://127.0.0.1:3456/lock-preview", { waitUntil: "networkidle" });
await page.getByLabel("비밀번호").fill("wrong-password");
await page.getByRole("button", { name: "비밀번호로 열기" }).click();
await page.getByText("비밀번호가 맞지 않아요").waitFor();
await page.screenshot({ path: fileURLToPath(new URL("lock-wrong.png", images)), fullPage: true });
await page.getByLabel("비밀번호").fill("labsidian");
await page.getByRole("button", { name: "비밀번호로 열기" }).click();
await page.getByText("열린 본문입니다").waitFor({ timeout: 20_000 });
await page.screenshot({ path: fileURLToPath(new URL("lock-open.png", images)), fullPage: true });
await browser.close();
console.log("lock screenshots ready");
