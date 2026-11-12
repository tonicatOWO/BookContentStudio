import { access, cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { parseArgs } from "node:util";
import { execFileSync } from "node:child_process";

const { values } = parseArgs({ options: { runtime: { type: "string" } }, strict: true });
if (!values.runtime) throw new Error("Pass --runtime <verified matching CLI portable directory>. It supplies Node, Chromium, Linux libraries/fonts and licenses.");
if (!["linux", "win32"].includes(process.platform) || process.arch !== "x64") throw new Error("Build natively on Linux x64 or Windows x64.");
const runtime = path.resolve(values.runtime);
const info = JSON.parse(await readFile(path.join(runtime, "build-info.json"), "utf8"));
const platform = process.platform === "win32" ? "windows" : "linux";
if (info.platform !== platform || info.arch !== process.arch) throw new Error("Portable runtime must match the build platform and architecture.");
const require = createRequire(import.meta.url);
const electronExecutable = require("electron");
const electronVersion = require("electron/package.json").version;
const playwrightVersion = JSON.parse(await readFile("node_modules/playwright/package.json", "utf8")).version;
if (info.playwright !== playwrightVersion) throw new Error("Portable runtime Playwright version must match installed Playwright.");
await access(path.join(runtime, "browser", process.platform === "win32" ? "chrome.exe" : "chrome"));
await access(path.join(runtime, "runtime", process.platform === "win32" ? "node.exe" : "node"));
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const output = path.resolve("dist", `books-desktop-${platform}-x64-${stamp}`);
const appDir = path.join(output, "electron", "resources", "app");
const copy = (from, to) => cp(from, to, { recursive: true, dereference: true });
await mkdir(appDir, { recursive: true });
await copy(path.dirname(electronExecutable), path.join(output, "electron"));
await copy(runtime, path.join(output, "scraper"));
await copy("build", path.join(appDir, "build"));
// Keep the CLI shipped inside the UI package current, too.
for (const file of await readdir("build", { withFileTypes: true })) {
  if (file.isFile()) await copy(path.join("build", file.name), path.join(output, "scraper", "app", file.name));
}
await copy("scripts/portable/launch.mjs", path.join(output, "scraper", "launch.mjs"));
for (const pkg of ["playwright", "playwright-core"]) {
  await copy(path.join(runtime, "node_modules", pkg), path.join(appDir, "node_modules", pkg));
}
await writeFile(path.join(appDir, "package.json"), JSON.stringify({ name: "books-desktop", version: "1.0.0", type: "module", main: "build/desktop/main.js" }, null, 2) + "\n");
await copy("README.md", path.join(output, "README.md"));
const buildInfo = { platform, arch: process.arch, builtAt: new Date().toISOString(), electron: electronVersion, playwright: playwrightVersion, runtimeSource: path.basename(runtime), runtime: info };
await writeFile(path.join(output, "build-info.json"), JSON.stringify(buildInfo, null, 2) + "\n");
if (process.platform === "win32") {
  await writeFile(path.join(output, "books-desktop.cmd"), '@echo off\r\nset "BOOKS_DESKTOP_ROOT=%~dp0"\r\n"%~dp0electron\\electron.exe" %*\r\n');
} else {
  // Include any additional ELF dependencies required by this Electron version.
  // Build on Ubuntu 22.04; never bundle glibc with a different host ELF loader.
  const core = /^(?:ld-linux[^/]*|lib(?:c|m|dl|pthread|rt|resolv|util|anl|BrokenLocale|thread_db|nss_[^/]+)\.so(?:\.|$))/;
  const ldd = execFileSync("ldd", [electronExecutable], { encoding: "utf8" });
  if (/=> not found/.test(ldd)) throw new Error(`Electron build-host dependencies are missing:\n${ldd}`);
  for (const line of ldd.split("\n")) {
    const match = line.match(/^\s*(\S+) => (\/\S+)/);
    if (!match || core.test(match[1])) continue;
    const destination = path.join(output, "scraper", "lib", match[1]);
    try { await access(destination); } catch { await copy(match[2], destination); }
  }
  // Copyright/license records for additional Ubuntu libraries (including GTK).
  await mkdir(path.join(output, "licenses", "system"), { recursive: true });
  try {
    for (const entry of await readdir("/usr/share/doc")) {
      const copyright = path.join("/usr/share/doc", entry, "copyright");
      try { await access(copyright); } catch { continue; }
      await mkdir(path.join(output, "licenses", "system", entry), { recursive: true });
      await copy(copyright, path.join(output, "licenses", "system", entry, "copyright"));
    }
    await copy("/usr/share/common-licenses", path.join(output, "licenses", "common"));
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  await writeFile(path.join(output, "books-desktop"), `#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
export BOOKS_DESKTOP_ROOT="$ROOT"
export LD_LIBRARY_PATH="$ROOT/scraper/lib"
export FONTCONFIG_FILE="$ROOT/scraper/fonts/fonts.conf"
export FONTCONFIG_PATH="$ROOT/scraper/fonts"
exec "$ROOT/electron/electron" --disable-gpu "$@"
`, { mode: 0o755 });
}
console.log(JSON.stringify({ directory: output, ...buildInfo }, null, 2));
