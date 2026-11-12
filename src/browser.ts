import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import path from "node:path";

export interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
}

export class PageNavigationError extends Error {
  constructor(public readonly status: number | undefined) {
    super(`Page navigation failed (HTTP ${status ?? "unknown"}).`);
  }
}

export async function openBrowser(headed = false): Promise<BrowserSession> {
  // Use a normal, unmodified Chromium configuration. No CAPTCHA/anti-bot bypass.
  const portableRoot = process.env.SCRAPER_PORTABLE_ROOT;
  const executablePath = process.env.SCRAPER_BROWSER_PATH || (portableRoot
    ? path.join(portableRoot, "browser", process.platform === "win32" ? "chrome.exe" : "chrome")
    : undefined);
  const browser = await chromium.launch({
    headless: !headed,
    ...(executablePath ? { executablePath } : {}),
  });
  const context = await browser.newContext({
    locale: "zh-TW",
    viewport: { width: 1440, height: 900 },
  });
  return { browser, context, page: await context.newPage() };
}

export async function gotoProduct(page: Page, url: string, timeout: number, headed = false, report: (message: string) => void = console.log): Promise<void> {
  if (new URL(url).hostname !== "www.books.com.tw") throw new Error("Expected a Books.com.tw product URL.");
  await gotoBooksPage(page, url, timeout, headed, report);
}

/** Shared navigation for official product and search pages, including verification. */
export async function gotoBooksPage(page: Page, url: string, timeout: number, headed = false, report: (message: string) => void = console.log): Promise<void> {
  const target = new URL(url);
  if (target.protocol !== "https:" || !["www.books.com.tw", "search.books.com.tw"].includes(target.hostname)) {
    throw new Error("Expected an official Books.com.tw HTTPS page.");
  }
  let response = await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout,
  });
  if (response?.headers()["cf-mitigated"] === "challenge") {
    if (!headed) {
      throw new Error("Cloudflare verification required (HTTP " + response.status() + "). Run again with --headed --timeout 120000 and complete verification in the browser.");
    }
    report("請在瀏覽器視窗完成網站驗證，完成後會自動繼續…");
    try {
      // Cloudflare may complete by replacing the document without emitting a
      // response that matches the original path. Poll the main frame as well
      // as listening for the navigation response so the worker can continue.
      await Promise.race([
        page.waitForResponse((candidate) => {
          const destination = new URL(candidate.url());
          return candidate.request().isNavigationRequest() &&
            candidate.request().frame() === page.mainFrame() &&
            destination.origin === target.origin &&
            candidate.status() >= 200 && candidate.status() < 300 &&
            candidate.headers()["cf-mitigated"] !== "challenge";
        }, { timeout }),
        page.waitForFunction(() => {
          const text = document.body?.innerText ?? "";
          const challenge = /請稍候|just a moment|checking your browser|verify you are human/i.test(text);
          return !challenge && document.body !== null;
        }, { timeout }),
      ]);
      await page.waitForLoadState("domcontentloaded", { timeout: Math.min(timeout, 15000) }).catch(() => {});
    } catch {
      throw new Error("Site verification was not completed within the timeout, or the browser was closed. No book content was extracted.");
    }
  }
  if (!response || response.status() >= 400) {
    throw new PageNavigationError(response?.status());
  }
  const final = new URL(page.url());
  if (final.origin !== target.origin) {
    throw new Error(`Unexpected redirect to ${final.hostname}; stopped.`);
  }
}
