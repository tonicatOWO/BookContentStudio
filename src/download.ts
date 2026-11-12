import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { APIRequestContext } from "playwright";
import type { ImageItem } from "./extract.js";

export interface ImageResult {
  elementIndex: number;
  alt: string;
  sourceUrl: string | null;
  file: string | null;
  error?: string;
}

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const IMAGE_REQUEST_TIMEOUT = 8000;
const IMAGE_CONCURRENCY = 4;
const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/svg+xml": "svg",
  "image/bmp": "bmp",
};

function allowedImageUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:") return false;
    const official = host === "books.com.tw" || host.endsWith(".books.com.tw") ||
      host === "book.com.tw" || host.endsWith(".book.com.tw");
    if (!official) return false;
    // Explicitly avoid disallowed paths listed in the current books.com.tw robots.txt.
    if (host === "www.books.com.tw") {
      return ![
        "/exep/ap.php", "/exep/prod/smallimg.php", "/exep/lib/captcha_image.php",
        "/exec/", "/exep/shopping/", "/cgi-bin/", "/product_show/getBrowseItemsAjax/",
      ].some((prefix) => url.pathname.startsWith(prefix));
    }
    return true;
  } catch {
    return false;
  }
}

export async function downloadImages(
  request: APIRequestContext,
  pageUrl: string,
  images: ImageItem[],
  outputDir: string,
  maxImages: number,
  report: (message: string) => void = () => {},
): Promise<ImageResult[]> {
  const saved = new Map<string, string>();
  const selected = images.slice(0, maxImages);
  const results: ImageResult[] = new Array(selected.length);
  let next = 0;
  async function downloadOne(image: ImageItem): Promise<ImageResult> {
    let error = "No permitted image URL was downloadable.";
    let success: ImageResult | null = null;

    for (const candidate of image.candidates) {
      if (!allowedImageUrl(candidate)) {
        error = "Image host/path is outside this project's allowlist or disallowed by robots rules.";
        continue;
      }
      const previouslySaved = saved.get(candidate);
      if (previouslySaved) {
        success = { elementIndex: image.elementIndex, alt: image.alt, sourceUrl: candidate, file: previouslySaved };
        break;
      }
      try {
        const response = await request.get(candidate, {
          timeout: IMAGE_REQUEST_TIMEOUT,
          maxRedirects: 3,
          headers: {
            referer: pageUrl,
            accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8",
          },
        });
        if (!response.ok()) throw new Error(`HTTP ${response.status()}`);
        const finalUrl = response.url();
        if (!allowedImageUrl(finalUrl)) throw new Error("Image redirected outside the permitted domains.");
        const mediaType = (response.headers()["content-type"] ?? "").split(";")[0].trim().toLowerCase();
        const extension = IMAGE_TYPES[mediaType];
        if (!extension) throw new Error(`Unsupported or non-image content-type: ${mediaType || "none"}`);
        const claimedLength = Number(response.headers()["content-length"] ?? "0");
        if (claimedLength > MAX_IMAGE_BYTES) throw new Error("Image exceeds 15 MB size limit.");
        const body = await response.body();
        if (body.byteLength > MAX_IMAGE_BYTES) throw new Error("Image exceeds 15 MB size limit.");
        const fileName = `${String(image.elementIndex + 1).padStart(3, "0")}.${extension}`;
        const file = path.posix.join("images", fileName);
        await writeFile(path.join(outputDir, file), body);
        saved.set(candidate, file);
        success = { elementIndex: image.elementIndex, alt: image.alt, sourceUrl: candidate, file };
        break;
      } catch (cause) {
        error = cause instanceof Error ? cause.message : String(cause);
      }
    }

    return success ?? { elementIndex: image.elementIndex, alt: image.alt, sourceUrl: null, file: null, error };
  }
  async function worker(): Promise<void> {
    while (true) {
      const index = next++;
      if (index >= selected.length) return;
      results[index] = await downloadOne(selected[index]);
      report(`已處理 ${index + 1}/${selected.length} 張書圖…`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(IMAGE_CONCURRENCY, selected.length) }, () => worker()));
  return results;
}
