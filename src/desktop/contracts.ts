import type { BookResult } from "../search.js";
import type { ScrapeResult } from "../scrape.js";

export type TaskRequest =
  | { kind: "search"; query: string; headed: boolean }
  | { kind: "scrape"; url: string; headed: boolean };
export type WorkerRequest = TaskRequest & { out: string; timeout?: number };
export type TaskEvent =
  | { type: "progress"; message: string }
  | { type: "results"; books: BookResult[] }
  | { type: "saved"; result: ScrapeResult }
  | { type: "error"; message: string }
  | { type: "cancelled" };
export interface LibraryBook { title: string; productId: string; outputDir: string; capturedAt: string; imagesDownloaded: number; contentLength: number; url: string; }
export interface RunRecord { id: string; kind: "search" | "scrape"; status: "completed" | "failed" | "cancelled"; startedAt: string; finishedAt: string; url?: string; title?: string; message?: string; }
export interface Schedule { id: string; url: string; mode: "hourly" | "daily" | "interval"; time?: string; minutes?: number; enabled: boolean; lastRun?: string; }
export interface Preferences { outputDir: string; headed: boolean; timeoutSeconds: number; }
export interface DesktopAPI {
  settings(): Promise<Preferences>;
  chooseFolder(): Promise<string | null>;
  start(request: TaskRequest): Promise<void>;
  cancel(): Promise<void>;
  openOutput(): Promise<void>;
  library(): Promise<LibraryBook[]>;
  history(): Promise<RunRecord[]>;
  schedules(): Promise<Schedule[]>;
  saveSchedule(schedule: Omit<Schedule, "id" | "lastRun">): Promise<Schedule>;
  toggleSchedule(id: string, enabled: boolean): Promise<void>;
  deleteSchedule(id: string): Promise<void>;
  preferences(): Promise<Preferences>;
  savePreferences(preferences: Preferences): Promise<Preferences>;
  onEvent(callback: (event: TaskEvent) => void): () => void;
}
