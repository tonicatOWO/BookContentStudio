import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";
const root = process.env.BOOKS_DESKTOP_ROOT;
console.log("Launching bundled Electron:", root);
const { _electron: electron } = createRequire(path.join(root, "electron/resources/app/package.json"))("playwright");
const app = await electron.launch({
  executablePath: path.join(root, "electron/electron"), args: ["--no-sandbox", "--disable-gpu"],
  env: { ...process.env, BOOKS_TEST_APP_PACKAGE: path.join(root, "electron/resources/app/package.json") },
  timeout: 30000,
});
try {
  console.log("Electron connected");
  const page = await app.firstWindow();
  console.log("Window opened");
  await page.locator("#output-path").filter({ hasText: "Books" }).waitFor();
  console.log("Renderer bridge ready");
  await app.evaluate(({ dialog }) => {
    process.execArgv.push("--import", "file:///test/desktop-fixture.mjs");
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: ["/tmp/下載 中文"] });
  });
  await page.locator("#choose-folder").click();
  await page.waitForFunction(() => document.querySelector("#output-path").textContent === "/tmp/下載 中文");
  await page.locator("#headed").uncheck();
  await page.locator("#query").fill("你的名字");
  await page.locator("#search").click();
  await page.locator("#cancel").waitFor({ state: "hidden", timeout: 30000 });
  assert.equal(await page.locator(".book-result").count(), 2, await page.locator("#status").textContent());
  await page.locator(".book-result").first().click();
  await page.locator("#download").click();
  await page.locator("#cancel").waitFor({ state: "hidden", timeout: 30000 });
  const status = await page.locator("#status").textContent();
  assert.match(status, /2\/2 張書圖/);
  const output = status.split("位置：")[1];
  assert.equal(await readFile(path.join(output, "content.txt"), "utf8"), "第一行簡介\n第二行簡介");
  await page.screenshot({ path: "/evidence/offline-desktop.png", fullPage: true });
  console.log("PASS: minimal Ubuntu desktop, package relocated to a Chinese/spaced read-only path, no network/host Node/browser/GTK; real UI, bundled worker/browser, 2 image files and introduction.");
} finally { await app.close(); }
