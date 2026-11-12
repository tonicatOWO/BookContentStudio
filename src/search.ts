import type { Page } from "playwright";
import { gotoBooksPage, PageNavigationError } from "./browser.js";

export interface BookResult {
  title: string;
  productId: string;
  url: string;
  authors: string[];
}

export function searchUrl(query: string): string {
  const keyword = query.trim();
  if (!keyword) throw new Error("Search keywords cannot be empty.");
  return `https://search.books.com.tw/search/query/key/${encodeURIComponent(keyword)}/cat/BKA`;
}

/** Read only main search cards, excluding recommendations and duplicate links. */
export async function extractSearchResults(page: Page, limit: number): Promise<BookResult[]> {
  return page.evaluate((maximum) => {
    const cards = [...document.querySelectorAll('[id^="prod-itemlist-"]:not([id^="prod-itemlist-footer-"])')];
    const countText = document.querySelector(".search_results")?.textContent ?? "";
    if (!cards.length) {
      const noResults = document.querySelector(".cntlisearch15 .none p")?.textContent ?? "";
      if (/抱歉，找不到您所查詢的/.test(noResults)) return [];
      if (/搜尋結果共\s*0\s*筆/.test(countText)) return [];
      throw new Error("Cannot recognize the search results page; no results were saved.");
    }
    const results: BookResult[] = [];
    const seen = new Set<string>();
    for (const card of cards) {
      const productId = card.id.replace("prod-itemlist-", "");
      const title = card.querySelector("h4 a")?.textContent?.replace(/\s+/g, " ").trim();
      if (!/^[A-Za-z0-9_-]+$/.test(productId) || !title) {
        throw new Error("Unrecognized book result card; no results were saved.");
      }
      if (seen.has(productId)) continue;
      seen.add(productId);
      results.push({
        title,
        productId,
        url: `https://www.books.com.tw/products/${productId}`,
        authors: [...card.querySelectorAll(".author a")].map((node) => node.textContent?.trim() ?? "").filter(Boolean),
      });
      if (results.length >= maximum) break;
    }
    return results;
  }, limit);
}

export async function searchBooks(page: Page, query: string, limit: number, timeout: number, headed = false, report: (message: string) => void = console.log): Promise<BookResult[]> {
  try {
    await gotoBooksPage(page, searchUrl(query), timeout, headed, report);
  } catch (error) {
    // The site's normal no-match page returns HTTP 404. Other errors stay errors.
    if (!(error instanceof PageNavigationError) || error.status !== 404 ||
      new URL(page.url()).origin !== "https://search.books.com.tw" ||
      !/抱歉，找不到您所查詢的/.test((await page.locator(".cntlisearch15 .none p").allTextContents()).join(""))) throw error;
    return [];
  }
  await page.locator('[id^="prod-itemlist-"], .search_results, .cntlisearch15 .none p').first().waitFor({ state: "attached", timeout });
  return extractSearchResults(page, limit);
}
