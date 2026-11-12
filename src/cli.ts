import { parseScrapeOptions } from "./options.js";
import { openBrowser } from "./browser.js";
import { scrapeBook } from "./scrape.js";

async function main(): Promise<void> {
  const options = parseScrapeOptions();
  const session = await openBrowser(options.headed);
  try {
    await scrapeBook(session, options);
  } finally {
    await session.browser.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
