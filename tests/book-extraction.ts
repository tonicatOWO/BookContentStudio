import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, type APIRequestContext } from "playwright";
import { extractImages, extractIntroduction } from "../src/extract.js";
import { downloadImages } from "../src/download.js";

const browser = await chromium.launch({ executablePath: process.env.SCRAPER_BROWSER_PATH });
try {
  const page = await browser.newPage();
  await page.route("**/*", (route) => route.abort());
  await page.setContent(`<div id="thumbnail"><a>上頁</a><img src="https://im1.book.com.tw/image/getImage?i=https://www.books.com.tw/img/001/106/30/0011063030.jpg&amp;w=348"><img src="https://im2.book.com.tw/image/getImage?i=https://www.books.com.tw/img/001/106/30/0011063030_b_01.jpg&amp;w=348"></div>
    <section><h3>內容簡介</h3><div class="content" style="display:none">★首刷限定<br>三葉與瀧<br><br>「我和他（她）互換靈魂了嗎？」</div></section>
    <section><h3>作者介紹</h3><div class="content">不要包含作者介紹</div></section>`);
  const text = await extractIntroduction(page);
  assert.equal(text, "★首刷限定\n三葉與瀧\n\n「我和他（她）互換靈魂了嗎？」");
  assert.equal(await extractIntroduction(page, "section .content >> nth=0"), text);
  const images = await extractImages(page.locator("#thumbnail"));
  assert.equal(images.length, 2);
  assert.ok(images[0].candidates[0].includes("&w=348"));
  const output = await mkdtemp(path.join(os.tmpdir(), "books-extraction-"));
  await mkdir(path.join(output, "images"));
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1cAAAAASUVORK5CYII=", "base64");
  const request = { get: async (url: string) => ({
    ok: () => true, url: () => url,
    headers: () => ({ "content-type": "image/png" }), body: async () => png,
  }) } as unknown as APIRequestContext;
  const results = await downloadImages(request, "https://www.books.com.tw/products/0011063030", images, output, 60);
  assert.equal(results.filter((item) => item.file).length, 2);
  for (const item of results) assert.deepEqual(await readFile(path.join(output, item.file!)), png);
  await assert.rejects(extractIntroduction(page, "#missing"), /exactly one/);
  await page.setContent("<h3>內容簡介</h3><p>未知的版型</p>");
  await assert.rejects(extractIntroduction(page), /content-selector/);
  console.log("PASS: two thumbnail images saved; introduction preserves breaks, includes collapsed text, excludes author section; unknown markup fails clearly.");
  console.log("Fixture output:", output);
} finally {
  await browser.close();
}
