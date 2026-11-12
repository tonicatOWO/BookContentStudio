import assert from "node:assert/strict";
import { openBrowser, gotoProduct } from "../src/browser.js";

const { browser, page } = await openBrowser();
const url = "https://www.books.com.tw/products/0011063030";
try {
  await page.route("**/*", (route) => route.fulfill({ status: 403, headers: { "cf-mitigated": "challenge" }, body: "Verify" }));
  await assert.rejects(gotoProduct(page, url, 3000), /Cloudflare verification required.*--headed/);
  await page.unrouteAll();
  await page.route("**/*", (route) => route.fulfill({ status: 403, body: "Forbidden" }));
  await assert.rejects(gotoProduct(page, url, 3000), /Page navigation failed \(HTTP 403\)/);
  await page.unrouteAll();
  await page.route("**/*", (route) => {
    if (route.request().url().endsWith("?verified=1")) {
      return route.fulfill({ status: 200, contentType: "text/html", body: '<title>Book</title><div id="thumbnail"></div>' });
    }
    if (route.request().url().includes("/child")) {
      return route.fulfill({ status: 200, contentType: "text/html", body: "Challenge iframe" });
    }
    return route.fulfill({ status: 403, headers: { "cf-mitigated": "challenge" }, contentType: "text/html",
      body: '<title>Challenge</title><iframe src="/child"></iframe><script>setTimeout(()=>location.search="?verified=1",600)</script>' });
  });
  // Simulate the navigation after a user completes verification. A successful
  // challenge iframe response must not count as the product page loading.
  await gotoProduct(page, url, 5000, true);
  await page.locator("#thumbnail").waitFor({ state: "attached" });
  assert.equal(await page.title(), "Book");
  await page.unrouteAll();
  await page.route("**/*", (route) => route.fulfill({ status: 403, headers: { "cf-mitigated": "challenge" }, body: "Verify" }));
  await assert.rejects(gotoProduct(page, url, 200, true), /verification was not completed/);
  console.log("PASS: Cloudflare diagnosed; ordinary 403 preserved; main-frame verified navigation resumes; timeout stays an error.");
} finally {
  await browser.close();
}
