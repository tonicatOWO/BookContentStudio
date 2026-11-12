import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseInspectOptions, productId } from "./options.js";
import { gotoProduct, openBrowser } from "./browser.js";

async function main(): Promise<void> {
  const options = parseInspectOptions();
  const outputDir = path.join(options.out, productId(options.url), "inspection");
  await mkdir(outputDir, { recursive: true });

  const { browser, page } = await openBrowser(options.headed);
  try {
    await gotoProduct(page, options.url, options.timeout, options.headed);
    const candidates = await page.evaluate(() => {
      return [...document.querySelectorAll("div[id], div[class]")]
        .map((node) => {
          const id = node.id;
          const classes = [...node.classList].filter(Boolean).slice(0, 3);
          const selector = id
            ? `#${CSS.escape(id)}`
            : classes.length ? `div.${classes.map((value) => CSS.escape(value)).join(".")}` : "div";
          const text = (node.textContent ?? "").replace(/\s+/g, " ").trim();
          return {
            selector,
            tag: node.tagName,
            characters: text.length,
            images: node.querySelectorAll("img").length,
            sample: text.slice(0, 110),
          };
        })
        .filter((item) => item.characters >= 40 || item.images > 0)
        .sort((a, b) => (b.images * 3 + Math.min(b.characters / 1000, 12)) -
          (a.images * 3 + Math.min(a.characters / 1000, 12)))
        .slice(0, 80);
    });
    await writeFile(path.join(outputDir, "candidates.json"), JSON.stringify(candidates, null, 2), "utf8");
    await page.screenshot({ path: path.join(outputDir, "page.png"), fullPage: false });
    console.log(`Candidates saved: ${path.join(outputDir, "candidates.json")}`);
    console.log(`Screenshot saved: ${path.join(outputDir, "page.png")}`);
    for (const item of candidates.slice(0, 25)) {
      console.log(`${item.selector.padEnd(42).slice(0, 42)} imgs=${String(item.images).padStart(3)} text=${String(item.characters).padStart(6)} ${item.sample.slice(0, 60)}`);
    }
    console.log("Use browser DevTools (F12 -> Inspect -> Copy -> Copy selector) for the exact target div.");
  } finally {
    await browser.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
