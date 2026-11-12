import assert from "node:assert/strict";
import { mkdir, readFile, readdir, mkdtemp } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { _electron as electron } from "playwright";

const require = createRequire(import.meta.url);
const evidence = await mkdtemp(path.resolve("artifacts/electron-20261112/desktop-test-"));
const output = path.join(evidence, "下載資料 中文");
await mkdir(output);
const fixture = pathToFileURL(path.resolve("tests/desktop-fixture.mjs")).href;
const packaged = process.env.BOOKS_TEST_PACKAGE;
const app = await electron.launch({
  executablePath: packaged ? path.join(packaged, "electron", process.platform === "win32" ? "electron.exe" : "electron") : require("electron"),
  args: ["--no-sandbox", ...(packaged ? [] : ["."])],
  env: {
    ...process.env,
    ...(!packaged && process.platform === "linux" ? { SCRAPER_BROWSER_PATH: process.env.SCRAPER_BROWSER_PATH || "/usr/bin/chromium" } : {}),
    ...(packaged ? { BOOKS_DESKTOP_ROOT: path.resolve(packaged),
      BOOKS_TEST_APP_PACKAGE: path.resolve(packaged, "electron/resources/app/package.json"),
      LD_LIBRARY_PATH: path.resolve(packaged, "scraper/lib"),
      FONTCONFIG_FILE: path.resolve(packaged, "scraper/fonts/fonts.conf"),
      FONTCONFIG_PATH: path.resolve(packaged, "scraper/fonts") } : {}),
  },
  timeout: 30000,
});
try {
  const page = await app.firstWindow();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.locator("#output-path").filter({ hasText: "Books" }).waitFor();
  assert.equal(await page.evaluate(() => typeof window.require), "undefined");
  const preferences = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences());
  assert.equal(preferences.contextIsolation, true);
  assert.equal(preferences.nodeIntegration, false);
  assert.equal(preferences.sandbox, true);
  await app.evaluate(({ dialog, shell }, { fixture, output }) => {
    process.execArgv.push("--import", fixture);
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [output] });
    shell.openPath = async (target) => { globalThis.lastOpenedFolder = target; return ""; };
  }, { fixture, output });
  await page.locator("#choose-folder").click();
  await page.waitForFunction((output) => document.querySelector("#output-path").textContent === output, output);
  await page.screenshot({ path: path.join(evidence, "01-initial.png") });
  await page.locator("#headed").uncheck();
  async function search(keyword) {
    await page.locator("#query").fill(keyword);
    await page.locator("#search").click();
    await page.locator("#cancel").waitFor({ state: "hidden", timeout: 30000 });
  }
  await search("你的名字");
  assert.equal(await page.locator(".book-result").count(), 2, await page.locator("#status").textContent());
  assert.equal(await page.locator("#results img").count(), 0, "Book title must be rendered as text");
  await page.locator(".book-result").first().click();
  assert.equal(await page.locator("#selected-title").textContent(), "你的名字。紀念版");
  await page.screenshot({ path: path.join(evidence, "02-results.png") });
  for (let index = 0; index < 2; index++) {
    await page.locator("#download").click();
    await page.locator("#cancel").waitFor({ state: "hidden", timeout: 30000 });
    assert.match(await page.locator("#status").textContent(), /2\/2 張書圖/);
  }
  const runs = (await readdir(output, { withFileTypes: true })).filter((entry) => entry.isDirectory() && entry.name.startsWith("book-")).map((entry) => entry.name);
  assert.equal(runs.length, 2, "Repeated downloads must preserve previous files");
  for (const run of runs) {
    const dir = path.join(output, run, "0011063030");
    assert.equal(await readFile(path.join(dir, "content.txt"), "utf8"), "第一行簡介\n第二行簡介");
    const metadata = JSON.parse(await readFile(path.join(dir, "metadata.json"), "utf8"));
    assert.equal(metadata.imagesDownloaded, 2);
    assert.equal((await readdir(path.join(dir, "images"))).length, 2);
  }
  await page.locator("#open-output").click();
  assert.ok((await app.evaluate(() => globalThis.lastOpenedFolder)).startsWith(output));
  await page.screenshot({ path: path.join(evidence, "03-downloaded.png") });
  await search("不存在");
  assert.equal(await page.locator(".book-result").count(), 0);
  assert.match(await page.locator("#status").textContent(), /沒有找到/);
  await search("錯誤");
  assert.match(await page.locator("#status").textContent(), /HTTP 403/);
  assert.equal(await page.locator("#status-box.error").count(), 1);
  await page.locator("#headed").check();
  await page.locator("#query").fill("等待驗證");
  await page.locator("#search").click();
  await page.waitForFunction(() => document.querySelector("#status").textContent.includes("完成網站驗證"), { timeout: 30000 });
  const duplicate = await page.evaluate(() => window.books.start({ kind: "search", query: "another", headed: false }).then(() => "unexpected", (error) => String(error)));
  assert.match(duplicate, /已有工作/);
  await page.locator("#cancel").click();
  await page.locator("#cancel").waitFor({ state: "hidden", timeout: 15000 });
  assert.match(await page.locator("#status").textContent(), /已取消/);
  await page.locator("#headed").uncheck();
  await search("再次搜尋");
  assert.equal(await page.locator(".book-result").count(), 2, "Can search again after cancellation");
  const invalid = await page.evaluate(() => window.books.start({ kind: "scrape", url: "https://example.com/", headed: false }).then(() => "unexpected", (error) => String(error)));
  assert.match(invalid, /博客來商品網址/);
  await page.locator("#direct summary").click();
  await page.locator("#product-url").fill("https://www.books.com.tw/products/0011063030");
  await page.locator("#use-url").click();
  assert.match(await page.locator("#selected-id").textContent(), /0011063030/);
  await page.setViewportSize({ width: 920, height: 700 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
  await page.screenshot({ path: path.join(evidence, "04-compact.png"), fullPage: true });
  assert.deepEqual(errors, []);
  // Closing the window during verification must cancel and exit the worker.
  await page.locator("#headed").check();
  await page.locator("#query").fill("等待關閉");
  await page.locator("#search").click();
  await page.waitForFunction(() => document.querySelector("#status").textContent.includes("完成網站驗證"));
  console.log("PASS: real Electron UI/IPC/worker/browser, search/select/download, 2 images + introduction, repeated downloads, folder chooser/opener, no-results/403, verification status, busy guard, cancellation/retry, direct URL, invalid IPC, renderer isolation, text-safe titles, compact layout, no renderer errors.");
  console.log("Evidence:", evidence);
} finally { await app.close(); }
