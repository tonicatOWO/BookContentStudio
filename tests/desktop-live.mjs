import assert from "node:assert/strict";
import path from "node:path";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { _electron as electron } from "playwright";

const root = path.resolve(process.env.BOOKS_TEST_PACKAGE);
const evidence = await mkdtemp(path.resolve("artifacts/electron-20261112/live-"));
const output = path.join(evidence, "books");
await mkdir(output);
const app = await electron.launch({
  executablePath: path.join(root, "electron/electron"), args: ["--no-sandbox"],
  env: { ...process.env, BOOKS_DESKTOP_ROOT: root,
    LD_LIBRARY_PATH: path.join(root, "scraper/lib"),
    FONTCONFIG_FILE: path.join(root, "scraper/fonts/fonts.conf"), FONTCONFIG_PATH: path.join(root, "scraper/fonts"),
  }, timeout: 30000,
});
try {
  const page = await app.firstWindow();
  await page.locator("#output-path").filter({ hasText: "Books" }).waitFor();
  await app.evaluate(({ dialog }, output) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [output] }); }, output);
  await page.locator("#choose-folder").click();
  await page.waitForFunction((output) => document.querySelector("#output-path").textContent === output, output);
  await page.locator("#query").fill("你的名字");
  await page.locator("#search").click();
  await page.locator("#cancel").waitFor({ state: "hidden", timeout: 180000 });
  const titles = await page.locator(".book-result").allTextContents();
  console.log("Real search candidates:", titles);
  assert.ok(titles.length > 0, await page.locator("#status").textContent());
  await page.screenshot({ path: path.join(evidence, "search.png"), fullPage: true });
  await page.locator("#direct summary").click();
  await page.locator("#product-url").fill("https://www.books.com.tw/products/0011063030");
  await page.locator("#use-url").click();
  await page.locator("#download").click();
  await page.locator("#cancel").waitFor({ state: "hidden", timeout: 180000 });
  const status = await page.locator("#status").textContent();
  console.log("Download:", status);
  assert.match(status, /已儲存內容簡介與 2\/2 張書圖/);
  const target = status.split("位置：")[1];
  const text = await readFile(path.join(target, "content.txt"), "utf8");
  assert.ok(text.length > 100);
  const metadata = JSON.parse(await readFile(path.join(target, "metadata.json"), "utf8"));
  assert.equal(metadata.imagesDownloaded, 2);
  assert.match(metadata.title, /你的名字/);
  console.log("Introduction characters:", text.length);
  await page.screenshot({ path: path.join(evidence, "download.png"), fullPage: true });
  console.log("PASS: packaged desktop real website search and product download, using bundled Node and Chromium.");
  console.log("Evidence:", evidence);
} finally { await app.close(); }
