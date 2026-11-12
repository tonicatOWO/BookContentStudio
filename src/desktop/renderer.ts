import type { DesktopAPI, LibraryBook, RunRecord, Schedule, TaskEvent, TaskRequest } from "./contracts.js";
import type { BookResult } from "../search.js";

declare global { interface Window { books: DesktopAPI } }
const api = window.books;
const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const query = element<HTMLInputElement>("query");
const headed = element<HTMLInputElement>("headed");
const download = element<HTMLButtonElement>("download");
const cancel = element<HTMLButtonElement>("cancel");
const open = element<HTMLButtonElement>("open-output");
let busy = false;
let selected: BookResult | undefined;
let books: BookResult[] = [];

function status(message: string, error = false): void {
  element("status").textContent = message;
  element("status-box").classList.toggle("error", error);
}
function setBusy(value: boolean): void {
  busy = value;
  for (const node of document.querySelectorAll<HTMLInputElement | HTMLButtonElement>("input, button")) node.disabled = value;
  download.disabled = value || !selected;
  cancel.hidden = !value;
  cancel.disabled = false;
  element("status-box").classList.toggle("busy", value);
}
function choose(book: BookResult): void {
  selected = book;
  element("selected-title").textContent = book.title;
  element("selected-author").textContent = book.authors.join("、") || "將從商品頁取得書籍資料。";
  element("selected-id").textContent = `商品編號 ${book.productId}`;
  element("selection").querySelector(".selection-label")!.textContent = "已選擇的書籍";
  download.disabled = busy;
  for (const button of document.querySelectorAll<HTMLButtonElement>(".book-result")) {
    const active = button.dataset.id === book.productId;
    button.classList.toggle("selected", active);
    button.setAttribute("aria-pressed", String(active));
    button.querySelector(".book-tick")!.textContent = active ? "✓" : "";
  }
}
function clearSelection(): void {
  selected = undefined;
  element("selected-title").textContent = "從左側選一本書";
  element("selected-author").textContent = "或貼上商品網址，直接開始。";
  element("selected-id").textContent = "";
  element("selection").querySelector(".selection-label")!.textContent = "尚未選擇";
  download.disabled = true;
}
function renderResults(): void {
  const list = element("results");
  list.replaceChildren();
  element("empty").hidden = books.length > 0;
  element("result-count").textContent = String(books.length);
  element("result-note").textContent = books.length ? "依網站排序 · 點選確認版本" : "沒有符合的書籍";
  if (!books.length) {
    element("empty").querySelector("h3")!.textContent = "還沒找到這本書。";
    element("empty").querySelector("p")!.textContent = "試試縮短書名，或換一組關鍵字。";
  }
  books.forEach((book, index) => {
    const button = document.createElement("button");
    button.className = "book-result";
    button.dataset.id = book.productId;
    button.setAttribute("aria-pressed", "false");
    const number = document.createElement("span");
    number.className = "book-number";
    number.textContent = String(index + 1).padStart(2, "0");
    const info = document.createElement("span");
    info.className = "book-info";
    const title = document.createElement("strong");
    title.textContent = book.title;
    const author = document.createElement("small");
    author.textContent = book.authors.join("、") || `商品編號 ${book.productId}`;
    const tick = document.createElement("span");
    tick.className = "book-tick";
    tick.setAttribute("aria-hidden", "true");
    info.append(title, author);
    button.append(number, info, tick);
    button.addEventListener("click", () => choose(book));
    list.append(button);
  });
}
async function start(request: TaskRequest): Promise<void> {
  if (busy) return;
  setBusy(true);
  status(request.kind === "search" ? "正在搜尋書籍…" : "正在準備下載…");
  try { await api.start(request); }
  catch (error) { setBusy(false); status(String(error), true); }
}
api.onEvent((event: TaskEvent) => {
  if (event.type === "progress") { status(event.message); return; }
  setBusy(false);
  if (event.type === "results") {
    books = event.books;
    clearSelection();
    renderResults();
    status(books.length ? `找到 ${books.length} 本候選書籍。選一本書，再下載書圖與簡介。` : "沒有找到符合的書籍，請換個關鍵字再試一次。");
  } else if (event.type === "saved") {
    const { imagesDownloaded, imagesAttempted, outputDir } = event.result;
    status(`已儲存內容簡介與 ${imagesDownloaded}/${imagesAttempted} 張書圖。${imagesDownloaded < imagesAttempted ? "部分圖片下載失敗，請查看 metadata.json。" : ""}位置：${outputDir}`);
    open.hidden = false;
  } else if (event.type === "cancelled") {
    status("已取消工作。已下載的檔案會保留。");
  } else status(event.message, true);
});
element<HTMLFormElement>("search-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (query.value.trim()) void start({ kind: "search", query: query.value.trim(), headed: headed.checked });
});
element<HTMLFormElement>("url-form").addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    const url = new URL(element<HTMLInputElement>("product-url").value.trim());
    if (url.origin !== "https://www.books.com.tw" || !/^\/products\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)) throw new Error("請貼上博客來單一商品網址。");
    choose({ title: "已指定商品網址", authors: [], url: url.href, productId: url.pathname.split("/").filter(Boolean).at(-1)! });
    for (const button of document.querySelectorAll(".book-result")) { button.classList.remove("selected"); button.setAttribute("aria-pressed", "false"); button.querySelector(".book-tick")!.textContent = ""; }
    status("已指定商品網址，按下下載後會取得書圖與簡介。");
  } catch { status("請輸入有效的博客來網址：https://www.books.com.tw/products/商品編號", true); }
});
download.addEventListener("click", () => { if (selected) void start({ kind: "scrape", url: selected.url, headed: headed.checked }); });
cancel.addEventListener("click", async () => { cancel.disabled = true; try { await api.cancel(); } catch (error) { status(String(error), true); cancel.disabled = false; } });
element("choose-folder").addEventListener("click", async () => {
  try { const folder = await api.chooseFolder(); if (folder) showFolder(folder); }
  catch (error) { status(String(error), true); }
});
open.addEventListener("click", async () => { try { await api.openOutput(); } catch (error) { status(String(error), true); } });
function showFolder(folder: string): void {
  element("output-path").textContent = folder;
  element("output-path").title = folder;
}
api.settings().then((settings) => showFolder(settings.outputDir)).catch((error) => status(String(error), true));

function page(name: string): void {
  for (const item of document.querySelectorAll<HTMLElement>(".app-page")) item.hidden = item.id !== `${name}-page`;
  for (const button of document.querySelectorAll<HTMLButtonElement>(".nav-item[data-page]")) button.classList.toggle("active", button.dataset.page === name);
  const overviewOnly = name === "overview";
  element("status-box").hidden = !overviewOnly;
  document.querySelector<HTMLElement>(".search-panel")!.hidden = !overviewOnly;
  document.querySelector<HTMLElement>(".hero")!.hidden = !overviewOnly;
  if (name === "library") void renderLibrary();
  if (name === "history") void renderHistory();
  if (name === "schedules") void renderSchedules();
  if (name === "preferences") void loadPreferences();
}
document.querySelectorAll<HTMLButtonElement>(".nav-item[data-page]").forEach((button) => button.addEventListener("click", () => page(button.dataset.page!)));
function row(text: string, meta: string): HTMLElement { const item = document.createElement("div"); item.className = "data-row"; const strong = document.createElement("strong"); strong.textContent = text; const small = document.createElement("small"); small.textContent = meta; item.append(strong, small); return item; }
async function renderLibrary(): Promise<void> { const list = element("library-list"); list.replaceChildren(); try { const books = await api.library(); if (!books.length) { list.append(row("尚無已下載書籍", "完成下載後會出現在這裡。")); return; } books.forEach((book: LibraryBook) => list.append(row(book.title, `${book.productId} · ${book.imagesDownloaded} 張書圖 · ${book.contentLength} 字 · ${book.capturedAt ? new Date(book.capturedAt).toLocaleString() : ""}`))); } catch (error) { list.append(row("讀取失敗", String(error))); } }
async function renderHistory(): Promise<void> { const list = element("history-list"); list.replaceChildren(); const records = await api.history(); if (!records.length) { list.append(row("尚無擷取紀錄", "開始搜尋或下載後會留下紀錄。")); return; } records.forEach((item: RunRecord) => list.append(row(item.status === "completed" ? "完成" : item.status === "cancelled" ? "已取消" : "失敗", `${item.kind} · ${item.title || item.url || ""} · ${new Date(item.finishedAt).toLocaleString()}${item.message ? ` · ${item.message}` : ""}`))); }
async function renderSchedules(): Promise<void> { const list = element("schedule-list"); list.replaceChildren(); const schedules = await api.schedules(); if (!schedules.length) { list.append(row("尚無排程", "新增商品網址後即可定時執行。")); return; } schedules.forEach((item: Schedule) => { const itemEl = row(item.url, item.mode === "daily" ? `每天 ${item.time}` : item.mode === "hourly" ? "每小時" : `每 ${item.minutes} 分鐘`); const toggle = document.createElement("button"); toggle.className = "secondary"; toggle.textContent = item.enabled ? "停用" : "啟用"; toggle.addEventListener("click", async () => { await api.toggleSchedule(item.id, !item.enabled); void renderSchedules(); }); const del = document.createElement("button"); del.className = "text-button"; del.textContent = "刪除"; del.addEventListener("click", async () => { await api.deleteSchedule(item.id); void renderSchedules(); }); itemEl.append(toggle, del); list.append(itemEl); }); }
async function loadPreferences(): Promise<void> { const settings = await api.preferences(); element<HTMLInputElement>("preference-output").value = settings.outputDir; element<HTMLInputElement>("preference-headed").checked = settings.headed; element<HTMLInputElement>("preference-timeout").value = String(settings.timeoutSeconds); }
element<HTMLSelectElement>("schedule-mode").addEventListener("change", () => { const mode = element<HTMLSelectElement>("schedule-mode").value; element("schedule-time-wrap").hidden = mode !== "daily"; element("schedule-minutes-wrap").hidden = mode !== "interval"; });
element<HTMLFormElement>("schedule-form").addEventListener("submit", async (event) => { event.preventDefault(); const mode = element<HTMLSelectElement>("schedule-mode").value as Schedule["mode"]; try { await api.saveSchedule({ url: element<HTMLInputElement>("schedule-url").value.trim(), mode, time: mode === "daily" ? element<HTMLInputElement>("schedule-time").value : undefined, minutes: mode === "interval" ? Number(element<HTMLInputElement>("schedule-minutes").value) : undefined, enabled: true }); element<HTMLInputElement>("schedule-url").value = ""; await renderSchedules(); status("排程已新增。"); } catch (error) { status(String(error), true); } });
element("refresh-library").addEventListener("click", () => void renderLibrary()); element("refresh-history").addEventListener("click", () => void renderHistory());
element<HTMLButtonElement>("preference-folder").addEventListener("click", async () => { const folder = await api.chooseFolder(); if (folder) element<HTMLInputElement>("preference-output").value = folder; });
element<HTMLFormElement>("preferences-form").addEventListener("submit", async (event) => { event.preventDefault(); try { await api.savePreferences({ outputDir: element<HTMLInputElement>("preference-output").value, headed: element<HTMLInputElement>("preference-headed").checked, timeoutSeconds: Number(element<HTMLInputElement>("preference-timeout").value) }); headed.checked = element<HTMLInputElement>("preference-headed").checked; status("偏好設定已儲存。"); } catch (error) { status(String(error), true); } });
