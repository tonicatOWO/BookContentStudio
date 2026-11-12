import type { Locator, Page } from "playwright";

/** Extract only the introduction, including text hidden behind a collapsed section. */
export async function extractIntroduction(page: Page, selector?: string): Promise<string> {
  const root = selector ? page.locator(selector) : page.locator("body");
  if (await root.count() !== 1) throw new Error("Content selector must match exactly one element.");
  return root.evaluate((element, explicit) => {
    let content: Element | null = explicit ? element : null;
    if (!explicit) {
      const headings = [...element.querySelectorAll("h1,h2,h3,h4,h5,h6")]
        .filter((heading) => heading.textContent?.replace(/\s/g, "") === "內容簡介");
      if (headings.length !== 1) throw new Error("Cannot uniquely locate 內容簡介. Supply --content-selector.");
      let parent = headings[0].parentElement;
      while (parent && parent !== element) {
        const candidates = parent.querySelectorAll(".content");
        if (candidates.length === 1) { content = candidates[0]; break; }
        if (candidates.length > 1) break;
        parent = parent.parentElement;
      }
    }
    if (!content) throw new Error("Cannot locate introduction body. Supply --content-selector.");
    const clone = content.cloneNode(true) as Element;
    clone.querySelectorAll("script,style,noscript,button").forEach((node) => node.remove());
    clone.querySelectorAll("br").forEach((node) => node.replaceWith("\n"));
    clone.querySelectorAll("p,div,li,section,blockquote").forEach((node) => node.append("\n"));
    const text = (clone.textContent ?? "").replace(/\r\n?/g, "\n")
      .split("\n").map((line) => line.trim()).join("\n").replace(/\n{3,}/g, "\n\n").trim();
    if (!text) throw new Error("Introduction is empty; no content was saved.");
    return text;
  }, !!selector);
}

export interface ImageItem {
  elementIndex: number;
  alt: string;
  candidates: string[];
}

/** Scroll visible <img> elements into view to trigger common lazy-loading patterns. */
export async function triggerLazyImages(container: Locator, limit: number): Promise<void> {
  const images = container.locator("img");
  const count = Math.min(await images.count(), limit);
  // Process small batches so a detached/blocked lazy image cannot add seconds
  // per image before the article and already-present URLs are extracted.
  for (let start = 0; start < count; start += 8) {
    const batch = Array.from({ length: Math.min(8, count - start) }, (_, offset) => images.nth(start + offset));
    await Promise.all(batch.map(async (image) => {
      try {
        if (await image.isVisible()) await image.scrollIntoViewIfNeeded({ timeout: 500 });
      } catch {
        // Hidden images, DOM replacements, etc. should not abort the extraction.
      }
    }));
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/** URLs are normalized inside the page, so relative and //host/path URLs work. */
export async function extractImages(container: Locator): Promise<ImageItem[]> {
  return await container.evaluate((root) => {
    const urls = {
      absolute(value: string | null | undefined): string | null {
        if (!value) return null;
        const source = value.trim();
        if (!source || source.startsWith("data:") || source.startsWith("blob:")) return null;
        try {
          const url = new URL(source, document.baseURI);
          return url.protocol === "https:" ? url.href : null;
        } catch {
          return null;
        }
      },

      srcsetUrls(srcset: string | null): string[] {
        if (!srcset) return [];
        // Standard remote srcset candidates. Data-URL srcsets are intentionally ignored.
        return srcset
          .split(",")
          .map((part) => part.trim().split(/\s+/)[0])
          .filter(Boolean)
          .reverse(); // Prefer the larger candidate when width/density ordered small -> large.
      },
    };

    return [...root.querySelectorAll("img")]
      .map((img, elementIndex) => {
        const pictureSources = img.closest("picture")
          ? [...img.closest("picture")!.querySelectorAll("source[srcset]")]
              .flatMap((source) => urls.srcsetUrls(source.getAttribute("srcset")))
          : [];
        const possible = [
          img.getAttribute("data-original"),
          img.getAttribute("data-zoom-image"),
          img.getAttribute("data-src"),
          img.getAttribute("data-lazy-src"),
          img.currentSrc,
          img.getAttribute("src"),
          ...urls.srcsetUrls(img.getAttribute("data-srcset")),
          ...urls.srcsetUrls(img.getAttribute("srcset")),
          ...pictureSources,
        ];
        const candidates = [...new Set(possible.map((value) => urls.absolute(value)).filter((url): url is string => !!url))];
        return {
          elementIndex,
          alt: img.getAttribute("alt") ?? "",
          candidates,
        };
      })
      .filter((item) => item.candidates.length > 0);
  });
}
