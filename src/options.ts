import { parseArgs } from "node:util";
import path from "node:path";

export interface CommonOptions {
  url: string;
  out: string;
  timeout: number;
  headed: boolean;
}

export interface ScrapeOptions extends CommonOptions {
  outputDir?: string;
  selector: string;
  contentSelector?: string;
  maxImages: number;
}

export interface SearchOptions {
  query: string;
  limit: number;
  out: string;
  timeout: number;
  headed: boolean;
}

const executable = process.env.SCRAPER_PORTABLE_ROOT
  ? process.platform === "win32" ? ".\\books-scraper.cmd" : "./books-scraper"
  : "npm run";
const separator = process.env.SCRAPER_PORTABLE_ROOT ? "" : " --";
const usage = `
Usage:
  ${executable} inspect${separator} --url "https://www.books.com.tw/products/0011063030"
  ${executable} scrape${separator} --url "https://www.books.com.tw/products/0011063030"
  ${executable} search${separator} --query "原子習慣"

Options:
  --url          Books.com.tw product URL (scrape/inspect)
  --query        Book keywords or partial title (search, required)
  --limit        Maximum results from the first search page (default: 20, 1-100)
  --selector     CSS selector of book images (default: #thumbnail)
  --content-selector CSS selector of introduction (default: locate by 內容簡介 heading)
  --out          Output directory (default: output)
  --max-images   Maximum number of images to download (default: 60)
  --timeout      Navigation timeout in milliseconds (default: 30000)
  --headed       Show browser; wait for manual site verification if requested
  --help         Show this help
`;

function getValues(search = false) {
  const { values } = parseArgs({
    options: {
      query: { type: "string" },
      limit: { type: "string" },
      url: { type: "string" },
      selector: { type: "string" },
      "content-selector": { type: "string" },
      "max-images": { type: "string" },
      out: { type: "string", default: "output" },
      timeout: { type: "string", default: "30000" },
      help: { type: "boolean", default: false },
      headed: { type: "boolean", default: false },
    },
    strict: true,
    allowPositionals: false,
  });
  if (values.help) {
    console.log(usage);
    process.exit(0);
  }
  if (search && [values.url, values.selector, values["content-selector"], values["max-images"]].some((value) => value !== undefined)) {
    throw new Error("search accepts --query, --limit, --out, --timeout and --headed.");
  }
  if (!search && (values.query !== undefined || values.limit !== undefined)) {
    throw new Error("--query and --limit are only supported by the search command.");
  }
  if (!search && !values.url) {
    throw new Error(`Missing --url.\n${usage}`);
  }
  const parsedUrl = values.url ? new URL(values.url) : undefined;
  if (parsedUrl && (parsedUrl.protocol !== "https:" || parsedUrl.hostname !== "www.books.com.tw")) {
    throw new Error("Only https://www.books.com.tw/ product URLs are supported.");
  }
  if (parsedUrl && !/^\/products\/[A-Za-z0-9_-]+\/?$/.test(parsedUrl.pathname)) {
    throw new Error("Expected a single product URL such as /products/0010905508.");
  }
  const timeout = Number(values.timeout);
  const maxImages = Number(values["max-images"] ?? "60");
  const query = values.query?.trim();
  const limit = Number(values.limit ?? "20");
  if (search && !query) throw new Error("--query must contain book keywords or a partial title.");
  if (search && (!Number.isInteger(limit) || limit < 1 || limit > 100)) {
    throw new Error("--limit must be an integer between 1 and 100.");
  }
  if (!Number.isInteger(timeout) || timeout < 1000 || timeout > 120000) {
    throw new Error("--timeout must be an integer between 1000 and 120000.");
  }
  if (!Number.isInteger(maxImages) || maxImages < 0 || maxImages > 500) {
    throw new Error("--max-images must be an integer between 0 and 500.");
  }
  return {
    url: parsedUrl?.href ?? "",
    query,
    limit,
    selector: values.selector,
    contentSelector: values["content-selector"],
    out: path.resolve(values.out ?? "output"),
    timeout,
    maxImages,
    headed: values.headed,
  };
}

export function parseSearchOptions(): SearchOptions {
  const options = getValues(true);
  return { query: options.query!, limit: options.limit, out: options.out, timeout: options.timeout, headed: options.headed };
}

export function parseScrapeOptions(): ScrapeOptions {
  const options = getValues();
  if (options.selector !== undefined && !options.selector.trim()) throw new Error("--selector cannot be empty.");
  if (options.contentSelector !== undefined && !options.contentSelector.trim()) throw new Error("--content-selector cannot be empty.");
  return { ...options, selector: options.selector ?? "#thumbnail" };
}

export function parseInspectOptions(): CommonOptions {
  const options = getValues();
  return { url: options.url, out: options.out, timeout: options.timeout, headed: options.headed };
}

export function productId(url: string): string {
  return new URL(url).pathname.split("/").filter(Boolean).at(-1) ?? "product";
}
