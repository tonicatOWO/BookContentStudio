// Imported only by test-launched workers using Node's --import option.
// Production code contains no fixture switch or mocked renderer bridge.
import { createRequire } from "node:module";
const { chromium } = createRequire(process.env.BOOKS_TEST_APP_PACKAGE || import.meta.url)("playwright");
const launch = chromium.launch.bind(chromium);
const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1cAAAAASUVORK5CYII=", "base64");
chromium.launch = async (options) => {
  const browser = await launch(options);
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (...args) => {
    const context = await newContext(...args);
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === "search.books.com.tw") {
        const keyword = decodeURIComponent(url.pathname);
        if (keyword.includes("不存在")) return route.fulfill({ status: 404, contentType: "text/html; charset=utf-8", body: '<div class="cntlisearch15"><div class="none"><p>抱歉，找不到您所查詢的資料</p></div></div>' });
        if (keyword.includes("錯誤")) return route.fulfill({ status: 403, body: "Forbidden" });
        if (keyword.includes("等待")) return route.fulfill({ status: 403, headers: { "cf-mitigated": "challenge" }, body: "Verification" });
        return route.fulfill({ contentType: "text/html; charset=utf-8", body: '<div class="search_results">搜尋結果共 2 筆</div><div id="prod-itemlist-0011063030"><h4><a>你的名字。紀念版</a></h4><p class="author"><a>新海誠</a></p></div><div id="prod-itemlist-0010822522"><h4><a>&lt;img src=x onerror=alert(1)&gt;原子習慣</a></h4><p class="author"><a>詹姆斯</a></p></div>' });
      }
      if (url.hostname === "www.books.com.tw" && url.pathname.startsWith("/products/")) {
        return route.fulfill({ contentType: "text/html; charset=utf-8", body: '<title>你的名字。紀念版</title><div id="thumbnail"><img src="https://im1.book.com.tw/fixture-one.png"><img src="https://im1.book.com.tw/fixture-two.png"></div><section><h3>內容簡介</h3><div class="content">第一行簡介<br>第二行簡介</div></section><section><h3>作者介紹</h3><div class="content">不應包含</div></section>' });
      }
      if (url.hostname === "im1.book.com.tw") return route.fulfill({ contentType: "image/png", body: image });
      return route.abort();
    });
    context.request.get = async (url) => ({
      ok: () => true, url: () => url,
      headers: () => ({ "content-type": "image/png" }), body: async () => image,
    });
    return context;
  };
  return browser;
};
