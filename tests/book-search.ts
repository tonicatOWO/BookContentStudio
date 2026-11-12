import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { openBrowser } from "../src/browser.js";
import { extractSearchResults, searchBooks, searchUrl } from "../src/search.js";

assert.equal(searchUrl(" 原子習慣 /?# "), "https://search.books.com.tw/search/query/key/%E5%8E%9F%E5%AD%90%E7%BF%92%E6%85%A3%20%2F%3F%23/cat/BKA");
assert.throws(() => searchUrl("  "), /empty/);
for (const args of [[], ["--query", " "], ["--query", "書", "--limit", "0"], ["--query", "書", "--limit", "1.5"], ["--query", "書", "--limit", "101"], ["--query", "書", "--url", "https://www.books.com.tw/products/001"]]) {
  const result = spawnSync(process.execPath, ["--import", "tsx", "src/search-cli.ts", ...args], { encoding: "utf8" });
  assert.equal(result.status, 1, result.stderr);
  assert.doesNotMatch(result.stderr, /browserType.launch/);
}
const { browser, page } = await openBrowser();
const card = (id: string, title: string) => `<div id="prod-itemlist-${id}"><h4><a href="//search.books.com.tw/redirect/move/item/${id}">${title}</a></h4><p class="author"><a>作者</a><a>譯者</a></p></div>`;
try {
  await page.route("**/*", (route) => route.fulfill({ contentType: "text/html; charset=utf-8", body:
    '<div class="search_results">搜尋結果共 <span>2</span> 筆</div>' +
    card("0010822522", "<em>原子</em>習慣：細微改變") + '<div id="prod-itemlist-footer-0010822522">收藏／購物車</div>' + card("0010822522", "重複連結") + card("0011045903", "實踐本") +
    '<aside><h4><a href="https://www.books.com.tw/products/999">推薦商品</a></h4></aside>',
  }));
  const results = await searchBooks(page, "原子習", 10, 3000);
  assert.deepEqual(results, [
    { productId: "0010822522", title: "原子習慣：細微改變", url: "https://www.books.com.tw/products/0010822522", authors: ["作者", "譯者"] },
    { productId: "0011045903", title: "實踐本", url: "https://www.books.com.tw/products/0011045903", authors: ["作者", "譯者"] },
  ]);
  assert.equal((await extractSearchResults(page, 1)).length, 1);
  await page.setContent('<div class="search_results">搜尋結果共 <span>0</span> 筆</div><aside>推薦商品</aside>');
  assert.deepEqual(await extractSearchResults(page, 20), []);
  await page.setContent('<h1>網站維護中</h1>');
  await assert.rejects(extractSearchResults(page, 20), /Cannot recognize/);
  await page.setContent(card("bad", ""));
  await assert.rejects(extractSearchResults(page, 20), /Unrecognized book/);
  await page.unrouteAll();
  await page.route("**/*", (route) => route.fulfill({ status: 404, contentType: "text/html; charset=utf-8", body: '<div class="cntlisearch15"><div class="none"><p>抱歉，找不到您所查詢的 "測試" 資料</p></div></div>' }));
  assert.deepEqual(await searchBooks(page, "測試", 20, 1000), []);
  await page.unrouteAll();
  await page.route("**/*", (route) => route.fulfill({ status: 404, contentType: "text/html", body: "Not found" }));
  await assert.rejects(searchBooks(page, "書", 20, 1000), /HTTP 404/);
  await page.unrouteAll();
  await page.route("**/*", (route) => route.fulfill({ status: 403, headers: { "cf-mitigated": "challenge" }, body: "Verify" }));
  await assert.rejects(searchBooks(page, "書", 20, 1000), /Cloudflare verification required/);
  console.log("PASS: partial title URL, CLI validation, main cards, canonical URLs, authors, deduplication, limit, empty/unknown pages, search challenge.");
} finally {
  await browser.close();
}
