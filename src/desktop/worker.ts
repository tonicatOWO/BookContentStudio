import { mkdir, mkdtemp } from "node:fs/promises";
import path from "node:path";
import { openBrowser, type BrowserSession } from "../browser.js";
import { searchBooks } from "../search.js";
import { scrapeBook } from "../scrape.js";
import type { TaskEvent, WorkerRequest } from "./contracts.js";

let session: BrowserSession | undefined;
let cancelled = false;
let started = false;
const send = (event: TaskEvent) => { if (process.connected) process.send?.(event); };
const report = (message: string) => send({ type: "progress", message });

process.on("message", async (request: WorkerRequest | { kind: "cancel" }) => {
  if (request.kind === "cancel") {
    cancelled = true;
    await session?.browser.close().catch(() => {});
    return;
  }
  if (started) return;
  started = true;
  let outcome: TaskEvent;
  try {
    report("正在開啟瀏覽器…");
    session = await openBrowser(request.headed);
    if (cancelled) throw new Error("Cancelled");
    if (request.kind === "search") {
      report("正在搜尋相關書籍…");
      const timeout = request.timeout ?? 120000;
      const books = await searchBooks(session.page, request.query, 20, timeout, request.headed, report);
      outcome = { type: "results", books };
    } else {
      await mkdir(request.out, { recursive: true });
      const out = await mkdtemp(path.join(request.out, "book-"));
      const result = await scrapeBook(session, {
        url: request.url, out, headed: request.headed, timeout: request.timeout ?? 120000,
        selector: "#thumbnail", maxImages: 60,
      }, report);
      outcome = { type: "saved", result };
    }
  } catch (error) {
    outcome = { type: "error", message: error instanceof Error ? error.message : String(error) };
  } finally {
    await session?.browser.close().catch(() => {});
  }
  send(cancelled ? { type: "cancelled" } : outcome!);
  process.disconnect?.();
});

process.on("disconnect", () => {
  cancelled = true;
  void session?.browser.close().finally(() => process.exit(0));
});
