import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";

const root = path.dirname(fileURLToPath(import.meta.url));
process.env.SCRAPER_PORTABLE_ROOT = root;
// A portable release always uses its own browser, independent of the user's cache.
delete process.env.SCRAPER_BROWSER_PATH;
const args = process.argv.slice(2);
const command = ["scrape", "inspect", "search", "--self-test"].includes(args[0]) ? args.shift() : "scrape";
if (command === "--self-test") {
  const { openBrowser } = await import("./app/browser.js");
  const { extractImages, extractIntroduction } = await import("./app/extract.js");
  const { extractSearchResults } = await import("./app/search.js");
  const { browser, page } = await openBrowser();
  let server;
  try {
    await page.route("**/*", (route) => route.abort());
    await page.setContent('<div id="thumbnail"><img src="https://www.books.com.tw/test.png"></div><section><h3>內容簡介</h3><div class="content">書本簡介<br>第二行</div></section>');
    if (await extractIntroduction(page) !== "書本簡介\n第二行") throw new Error("Introduction extraction failed.");
    if ((await extractImages(page.locator("#thumbnail"))).length !== 1) throw new Error("Image extraction failed.");
    await page.setContent('<div id="prod-itemlist-0010822522"><h4><a>原子習慣</a></h4></div>');
    const books = await extractSearchResults(page, 1);
    if (books.length !== 1 || books[0].url !== "https://www.books.com.tw/products/0010822522") throw new Error("Search extraction failed.");
    const screenshot = await page.screenshot();
    if (!screenshot.length) throw new Error("Rendering failed.");
    // Local self-signed HTTPS exercises dynamically loaded NSS modules even
    // with external networking disabled. TLS verification stays enabled in scrape.
    const { createServer } = await import("node:https");
    server = createServer({
      key: await readFile(path.join(root, "test-tls", "key.pem")),
      cert: await readFile(path.join(root, "test-tls", "cert.pem")),
    }, (_request, response) => { response.end("portable HTTPS test"); });
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const tlsContext = await browser.newContext({ ignoreHTTPSErrors: true });
    const tlsPage = await tlsContext.newPage();
    await tlsPage.goto(`https://127.0.0.1:${server.address().port}`);
    if (await tlsPage.locator("body").innerText() !== "portable HTTPS test") throw new Error("HTTPS failed.");
    await tlsContext.close();
    console.log("PASS: bundled Node, Chromium, introduction, thumbnail and search extraction, rendering and local HTTPS/NSS.");
    console.log(await readFile(path.join(root, "build-info.json"), "utf8"));
  } finally {
    await browser.close();
    if (server) await new Promise((resolve) => server.close(resolve));
  }
} else {
  const entry = path.join(root, "app", command === "search" ? "search-cli.js" : command === "inspect" ? "inspect.js" : "cli.js");
  process.argv = [process.execPath, entry, ...args];
  await import(pathToFileURL(entry).href);
}
