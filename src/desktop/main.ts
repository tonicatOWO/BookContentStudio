import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { fork, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { promises as fs } from "node:fs";
import type { LibraryBook, Preferences, RunRecord, Schedule, TaskEvent, TaskRequest } from "./contracts.js";

const directory = path.dirname(fileURLToPath(import.meta.url));
const portableRoot = process.env.BOOKS_DESKTOP_ROOT;
let window: BrowserWindow;
let worker: ChildProcess | undefined;
let cancelTimer: ReturnType<typeof setTimeout> | undefined;
let cancelling = false;
let outputDir: string;
let lastOutput: string | undefined;
let quitting = false;
let preferences: Preferences;
let history: RunRecord[] = [];
let schedules: Schedule[] = [];
let scheduleTimer: ReturnType<typeof setInterval> | undefined;

const stateFile = () => path.join(app.getPath("userData"), "books-state.json");
async function persistState(): Promise<void> {
  await fs.mkdir(path.dirname(stateFile()), { recursive: true });
  await fs.writeFile(stateFile(), JSON.stringify({ preferences, history, schedules }, null, 2));
}
async function loadState(): Promise<void> {
  outputDir = path.join(app.getPath("downloads"), "Books");
  preferences = { outputDir, headed: true, timeoutSeconds: 120 };
  try {
    const saved = JSON.parse(await fs.readFile(stateFile(), "utf8"));
    preferences = { ...preferences, ...saved.preferences };
    history = Array.isArray(saved.history) ? saved.history : [];
    schedules = Array.isArray(saved.schedules) ? saved.schedules : [];
    outputDir = preferences.outputDir;
  } catch { /* first launch */ }
}
async function readLibrary(): Promise<LibraryBook[]> {
  const found: LibraryBook[] = [];
  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > 4) return;
    let entries; try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full, depth + 1);
      else if (entry.name === "metadata.json") {
        try {
          const m = JSON.parse(await fs.readFile(full, "utf8"));
          found.push({ title: m.title || "未命名書籍", productId: path.basename(path.dirname(full)), outputDir: path.dirname(full), capturedAt: m.capturedAt || "", imagesDownloaded: m.imagesDownloaded || 0, contentLength: Number((await fs.readFile(path.join(path.dirname(full), "content.txt"), "utf8")).length), url: m.finalUrl || m.requestedUrl || "" });
        } catch { /* ignore incomplete output */ }
      }
    }
  }
  await walk(outputDir, 0); return found.sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
}

const emit = (event: TaskEvent) => { if (!window.isDestroyed()) window.webContents.send("books:event", event); };

function validateRequest(value: unknown): TaskRequest {
  if (!value || typeof value !== "object") throw new Error("無效的工作要求。");
  const request = value as TaskRequest;
  if (typeof request.headed !== "boolean") throw new Error("無效的瀏覽器設定。");
  if (request.kind === "search") {
    if (typeof request.query !== "string" || !request.query.trim() || request.query.length > 300) throw new Error("請輸入 1～300 字的書名或關鍵字。");
    return { kind: "search", query: request.query.trim(), headed: request.headed };
  }
  if (request.kind === "scrape") {
    const url = new URL(request.url);
    if (url.origin !== "https://www.books.com.tw" || url.username || url.password || !/^\/products\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)) {
      throw new Error("請輸入博客來商品網址：https://www.books.com.tw/products/商品編號");
    }
    return { kind: "scrape", url: url.href, headed: request.headed };
  }
  throw new Error("未知的工作類型。");
}

function stopWorker(): void {
  if (!worker || cancelling) return;
  cancelling = true;
  worker.send({ kind: "cancel" });
  emit({ type: "progress", message: "正在取消，關閉瀏覽器…" });
  cancelTimer = setTimeout(() => worker?.kill("SIGTERM"), 8000);
}

function startRequest(request: TaskRequest, scheduleId?: string): void {
  if (worker) return;
  cancelling = false;
  const startedAt = new Date().toISOString();
  const env: NodeJS.ProcessEnv = { ...process.env, ELECTRON_RUN_AS_NODE: "1" };
  if (portableRoot) { env.SCRAPER_PORTABLE_ROOT = path.join(portableRoot, "scraper"); delete env.SCRAPER_BROWSER_PATH; }
  const child = fork(path.join(directory, "worker.js"), [], { env, stdio: ["ignore", "pipe", "pipe", "ipc"], ...(portableRoot ? { execPath: path.join(portableRoot, "scraper", "runtime", process.platform === "win32" ? "node.exe" : "node") } : {}) });
  worker = child;
  let terminal: TaskEvent | undefined; let diagnostic = "";
  child.stderr?.on("data", (chunk) => { diagnostic = (diagnostic + String(chunk)).slice(-3000); });
  child.on("message", (message: TaskEvent) => { if (message.type === "progress") emit(message); else terminal = message; });
  child.on("error", (error) => { terminal = { type: "error", message: error.message }; }); child.stdout?.resume();
  child.on("close", () => {
    clearTimeout(cancelTimer); worker = undefined;
    const event = cancelling ? { type: "cancelled" } as const : terminal ?? { type: "error", message: diagnostic || "背景工作意外結束，請重試。" };
    const finishedAt = new Date().toISOString();
    const record: RunRecord = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, kind: request.kind, status: event.type === "saved" ? "completed" : event.type === "cancelled" ? "cancelled" : "failed", startedAt, finishedAt, url: request.kind === "scrape" ? request.url : undefined, title: event.type === "saved" ? event.result.title : undefined, message: event.type === "error" ? event.message : undefined };
    history = [record, ...history].slice(0, 200); if (scheduleId) { const item = schedules.find((x) => x.id === scheduleId); if (item) item.lastRun = finishedAt; } void persistState();
    if (event.type === "saved") { lastOutput = event.result.outputDir; void dialog.showMessageBox(window, { type: "info", title: "下載完成", message: "書本內容已下載完成。", detail: `書圖：${event.result.imagesDownloaded}/${event.result.imagesAttempted}\n儲存位置：${event.result.outputDir}`, buttons: ["確定"] }); }
    emit(event); if (quitting) app.quit();
  });
  child.send({ ...request, out: outputDir, timeout: preferences.timeoutSeconds * 1000 });
}

function scheduleDue(item: Schedule, now = new Date()): boolean {
  if (!item.enabled || !item.url) return false;
  if (item.lastRun) { const elapsed = now.getTime() - Date.parse(item.lastRun); if (item.mode === "hourly" && elapsed < 3600000) return false; if (item.mode === "interval" && elapsed < (item.minutes || 60) * 60000) return false; if (item.mode === "daily" && elapsed < 23 * 3600000) return false; }
  if (item.mode === "daily" && item.time && now.toTimeString().slice(0, 5) !== item.time) return false;
  return true;
}

app.setName("書頁 Books");
void app.whenReady().then(async () => {
await loadState();
window = new BrowserWindow({
  width: 1180, height: 820, minWidth: 920, minHeight: 700,
  title: "書頁 Books", backgroundColor: "#f5f4ef", autoHideMenuBar: true,
  webPreferences: {
    preload: path.join(directory, "preload.cjs"),
    contextIsolation: true, nodeIntegration: false, sandbox: true,
  },
});
window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
window.webContents.on("will-navigate", (event) => event.preventDefault());

// Only the local app's top-level renderer may call this narrow bridge.
for (const [channel, handler] of Object.entries({
  "books:settings": () => preferences,
  "books:choose-folder": async () => {
    if (worker) throw new Error("請先等待目前工作完成。");
    const result = await dialog.showOpenDialog(window, { title: "選擇儲存位置", defaultPath: outputDir, properties: ["openDirectory", "createDirectory"] });
    if (result.canceled) return null;
    outputDir = result.filePaths[0]; preferences.outputDir = outputDir; await persistState(); return outputDir;
  },
  "books:start": (_event: unknown, value: unknown) => { if (worker) throw new Error("目前已有工作執行中。"); startRequest(validateRequest(value)); },
  "books:library": () => readLibrary(),
  "books:history": () => history,
  "books:schedules": () => schedules,
  "books:save-schedule": async (_event: unknown, value: unknown) => {
    const item = value as Omit<Schedule, "id" | "lastRun">;
    if (!item || !/^https:\/\/www\.books\.com\.tw\/products\/[A-Za-z0-9_-]+\/?$/.test(item.url) || !["hourly", "daily", "interval"].includes(item.mode)) throw new Error("排程資料無效。");
    if (item.mode === "daily" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(item.time || "")) throw new Error("請設定每天執行時間。");
    if (item.mode === "interval" && (!Number.isInteger(item.minutes) || item.minutes! < 1)) throw new Error("請設定有效的分鐘間隔。");
    const saved: Schedule = { ...item, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }; schedules = [saved, ...schedules]; await persistState(); return saved;
  },
  "books:toggle-schedule": async (_event: unknown, id: string, enabled: boolean) => { const item = schedules.find((x) => x.id === id); if (!item) throw new Error("找不到排程。"); item.enabled = Boolean(enabled); await persistState(); },
  "books:delete-schedule": async (_event: unknown, id: string) => { schedules = schedules.filter((x) => x.id !== id); await persistState(); },
  "books:preferences": () => preferences,
  "books:save-preferences": async (_event: unknown, value: Preferences) => { if (!value || typeof value.outputDir !== "string" || typeof value.headed !== "boolean" || !Number.isFinite(value.timeoutSeconds) || value.timeoutSeconds < 5) throw new Error("偏好設定無效。"); preferences = { ...value, timeoutSeconds: Math.round(value.timeoutSeconds) }; outputDir = preferences.outputDir; await persistState(); return preferences; },
  "books:cancel": () => stopWorker(),
  "books:open-output": async () => {
    if (!lastOutput) throw new Error("尚無已完成的下載。");
    const error = await shell.openPath(lastOutput);
    if (error) throw new Error(error);
  },
})) {
  ipcMain.handle(channel, (event, ...args) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error("不允許的來源。");
    return (handler as (...args: unknown[]) => unknown)(event, ...args);
  });
}

scheduleTimer = setInterval(() => {
  const now = new Date();
  const item = schedules.find((candidate) => scheduleDue(candidate, now));
  if (item && !worker) startRequest({ kind: "scrape", url: item.url, headed: preferences.headed }, item.id);
}, 60_000);

await window.loadFile(path.join(directory, "index.html"));
window.on("close", (event) => {
  if (worker) {
    event.preventDefault();
    quitting = true;
    stopWorker();
  }
});
app.on("window-all-closed", () => app.quit());
app.on("before-quit", (event) => {
  clearInterval(scheduleTimer);
  if (worker) { event.preventDefault(); quitting = true; stopWorker(); }
});
}).catch((error) => { console.error(error); app.quit(); });
