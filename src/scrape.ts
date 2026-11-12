import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { productId, type ScrapeOptions } from "./options.js";
import { gotoProduct, type BrowserSession } from "./browser.js";
import { extractImages, triggerLazyImages, extractIntroduction } from "./extract.js";
import { downloadImages } from "./download.js";

export interface ScrapeResult {
  outputDir: string;
  title: string;
  imagesDownloaded: number;
  imagesAttempted: number;
}

export async function scrapeBook(session: BrowserSession, options: ScrapeOptions, report: (message: string) => void = console.log): Promise<ScrapeResult> {
  const outputDir = options.outputDir ?? path.join(options.out, productId(options.url));
  await mkdir(path.join(outputDir, "images"), { recursive: true });

  const { context, page } = session;
  report(`Loading: ${options.url}`);
  await gotoProduct(page, options.url, options.timeout, options.headed, report);

  const container = page.locator(options.selector).first();
  try {
    await container.waitFor({ state: "attached", timeout: options.timeout });
  } catch {
    await page.screenshot({ path: path.join(outputDir, "debug.png"), fullPage: false });
    throw new Error(`Selector '${options.selector}' matched 0 elements. Inspect debug.png or run npm run inspect.`);
  }
  const matches = await page.locator(options.selector).count();
  if (matches > 1) report(`Selector matched ${matches} elements; extracting the first one.`);

  report("正在擷取書圖與內容簡介…");
  await triggerLazyImages(container, Math.max(options.maxImages, 30));
  const [outerHTML, innerHTML, text, candidates, title] = await Promise.all([
    container.evaluate((element) => element.outerHTML),
    container.innerHTML(),
    extractIntroduction(page, options.contentSelector),
    extractImages(container),
    page.title(),
  ]);

  // Exact post-render DOM serialization is preserved separately from downloads.
  await Promise.all([
    writeFile(path.join(outputDir, "fragment.html"), outerHTML, "utf8"),
    writeFile(path.join(outputDir, "inner.html"), innerHTML, "utf8"),
    writeFile(path.join(outputDir, "content.txt"), text, "utf8"),
  ]);
  report(`正在下載 ${Math.min(candidates.length, options.maxImages)} 張書圖…`);
  const images = await downloadImages(context.request, page.url(), candidates, outputDir, options.maxImages, report);
  const metadata = {
    requestedUrl: options.url,
    finalUrl: page.url(),
    title,
    selector: options.selector,
    contentSelector: options.contentSelector ?? null,
    matchedElements: matches,
    capturedAt: new Date().toISOString(),
    imageElementsFound: candidates.length,
    imagesAttempted: images.length,
    imagesDownloaded: images.filter((item) => item.file !== null).length,
    images,
    note: "fragment.html contains the rendered DOM outerHTML; its src attributes are NOT rewritten to local paths.",
  };
  await writeFile(path.join(outputDir, "metadata.json"), JSON.stringify(metadata, null, 2) + "\n", "utf8");

  report(`Saved: ${outputDir}`);
  report(`Image elements: ${candidates.length}, downloaded: ${metadata.imagesDownloaded}/${images.length}`);
  report("Files: fragment.html, inner.html, content.txt, metadata.json, images/*");
  return { outputDir, title, imagesDownloaded: metadata.imagesDownloaded, imagesAttempted: metadata.imagesAttempted };
}
