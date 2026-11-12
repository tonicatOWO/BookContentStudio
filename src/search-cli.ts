import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { openBrowser } from "./browser.js";
import { parseSearchOptions } from "./options.js";
import { searchBooks, searchUrl } from "./search.js";

async function main(): Promise<void> {
  const options = parseSearchOptions();
  const { browser, page } = await openBrowser(options.headed);
  try {
    const results = await searchBooks(page, options.query, options.limit, options.timeout, options.headed);
    await mkdir(options.out, { recursive: true });
    const file = path.join(options.out, `search-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    await writeFile(file, JSON.stringify({
      query: options.query, searchUrl: searchUrl(options.query), finalUrl: page.url(),
      capturedAt: new Date().toISOString(), scope: "first page", results,
    }, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
    results.forEach((book, index) => console.log(`${index + 1}. ${book.title}\n   ${book.authors.join("、")}\n   ${book.url}`));
    console.log(results.length ? `Found ${results.length} candidates (first page only).` : "No matching books found.");
    console.log(`Saved: ${file}`);
    console.log("To download a book, run scrape --url with its product URL.");
  } finally {
    await browser.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
