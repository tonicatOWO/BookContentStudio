import { cp, mkdir, readFile, writeFile, access, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";

const project = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
if (!["linux", "win32"].includes(process.platform) || process.arch !== "x64") {
  throw new Error("Build on Linux x86_64 or Windows x64 for the matching target.");
}
const platform = process.platform === "win32" ? "windows" : "linux";
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const name = `books-scraper-${platform}-x64-${stamp}`;
const output = path.join(project, "dist", name);
await mkdir(output, { recursive: true });
const run = (file, args) => execFileSync(file, args, { cwd: project, encoding: "utf8" });
const copy = async (from, to) => {
  await mkdir(path.dirname(to), { recursive: true });
  await cp(from, to, { recursive: true, dereference: true });
};
run(process.execPath, ["node_modules/typescript/bin/tsc", "--noEmit", "false", "--outDir", path.join(output, "app")]);
await copy(process.execPath, path.join(output, "runtime", platform === "windows" ? "node.exe" : "node"));
for (const pkg of ["playwright", "playwright-core"]) {
  await copy(path.join(project, "node_modules", pkg), path.join(output, "node_modules", pkg));
}
const browserExecutable = chromium.executablePath();
await access(browserExecutable);
await copy(path.dirname(browserExecutable), path.join(output, "browser"));
await copy(path.join(project, "scripts/portable/launch.mjs"), path.join(output, "launch.mjs"));
await copy(path.join(project, "README.md"), path.join(output, "README.md"));
await writeFile(path.join(output, "package.json"), '{"private":true,"type":"module"}\n');
const info = {
  platform, arch: process.arch, builtAt: new Date().toISOString(), node: process.versions.node,
  playwright: JSON.parse(await readFile(path.join(project, "node_modules/playwright/package.json"), "utf8")).version,
  glibc: process.report.getReport().header.glibcVersionRuntime ?? null,
};

if (platform === "linux") {
  // Never mix a bundled glibc with the host's ELF loader. Release CI builds on
  // Ubuntu 22.04 (glibc 2.35); newer glibc hosts can run those bundled libraries.
  const core = /^(?:ld-linux[^/]*|lib(?:c|m|dl|pthread|rt|resolv|util|anl|BrokenLocale|thread_db|nss_[^/]+)\.so(?:\.|$))/;
  const copied = new Set();
  const collect = async (binary) => {
    const listing = run("ldd", [binary]);
    if (/=> not found/.test(listing)) throw new Error(`Missing build-host libraries for ${binary}:\n${listing}`);
    for (const line of listing.split("\n")) {
      const match = line.match(/^\s*(\S+) => (\/\S+)/);
      if (!match || core.test(match[1]) || copied.has(match[1])) continue;
      copied.add(match[1]);
      await copy(await realpath(match[2]), path.join(output, "lib", match[1]));
    }
  };
  await collect(browserExecutable);
  await collect(process.execPath);
  // NSS loads these modules dynamically, so they are not in Chromium's ldd list.
  const cache = run("ldconfig", ["-p"]);
  const nssDirectory = path.dirname(cache.split("\n").find((line) => line.trim().startsWith("libnss3.so "))?.match(/=> (\/\S+)/)?.[1] ?? "");
  for (const module of ["libsoftokn3.so", "libfreebl3.so", "libfreeblpriv3.so", "libnssckbi.so"]) {
    const match = cache.split("\n").find((line) => line.trim().startsWith(`${module} `))?.match(/=> (\/\S+)/);
    // Ubuntu's NSS plugin libraries are not necessarily in ldconfig's cache.
    const candidates = [match?.[1], path.join(nssDirectory, module), path.join(nssDirectory, "nss", module)].filter(Boolean);
    let source;
    for (const candidate of candidates) {
      try { await access(candidate); source = candidate; break; } catch {}
    }
    if (!source) throw new Error(`Missing NSS plugin ${module}; install libnss3 on the build host.`);
    await copy(await realpath(source), path.join(output, "lib", module));
    await collect(source);
  }
  const font = run("fc-match", ["-f", "%{file}", "sans-serif:lang=zh-tw"]).trim();
  if (!font) throw new Error("Install a Chinese font on the build host (fonts-noto-cjk in release CI).");
  await copy(font, path.join(output, "fonts", path.basename(font)));
  await writeFile(path.join(output, "fonts", "fonts.conf"), '<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig><dir prefix="relative">.</dir><cachedir prefix="xdg">fontconfig</cachedir></fontconfig>\n');
  await writeFile(path.join(output, "books-scraper"), `#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
export LD_LIBRARY_PATH="$ROOT/lib"
export FONTCONFIG_FILE="$ROOT/fonts/fonts.conf"
export FONTCONFIG_PATH="$ROOT/fonts"
exec "$ROOT/runtime/node" "$ROOT/launch.mjs" "$@"
`, { mode: 0o755 });
  // Preserve the license texts for the distro libraries and bundled fonts.
  for (const dir of ["/usr/share/doc", "/usr/share/licenses"]) {
    try {
      await access(dir);
      if (dir.endsWith("doc")) {
        // Ubuntu package copyright files include the license text/references.
        const { readdir } = await import("node:fs/promises");
        for (const entry of await readdir(dir)) {
          const source = path.join(dir, entry, "copyright");
          try { await access(source); } catch { continue; }
          await copy(source, path.join(output, "licenses", "system", entry, "copyright"));
        }
        await copy("/usr/share/common-licenses", path.join(output, "licenses", "common"));
      } else {
        await copy(dir, path.join(output, "licenses", "system"));
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  await writeFile(path.join(output, "bundled-libraries.txt"), [...copied].sort().join("\n") + "\n");
} else {
  await writeFile(path.join(output, "books-scraper.cmd"), '@echo off\r\n"%~dp0runtime\\node.exe" "%~dp0launch.mjs" %*\r\n');
}

// setup-node's distribution has LICENSE adjacent to bin/ (Linux) or node.exe
// (Windows). Distro builds can use their packaged Node license instead.
const nodeLicenses = [path.join(path.dirname(process.execPath), "LICENSE"), path.join(path.dirname(process.execPath), "../LICENSE"), "/usr/share/licenses/nodejs/LICENSE"];
let nodeLicenseFound = false;
for (const candidate of nodeLicenses) {
  try { await access(candidate); } catch { continue; }
  await copy(candidate, path.join(output, "licenses", "Node-LICENSE"));
  nodeLicenseFound = true;
  break;
}
if (!nodeLicenseFound) throw new Error("Cannot locate Node LICENSE; build with an official Node distribution.");
await writeFile(path.join(output, "build-info.json"), JSON.stringify(info, null, 2) + "\n");
await copy(path.join(project, "scripts/portable/test-tls"), path.join(output, "test-tls"));
console.log(JSON.stringify({ directory: output, ...info }, null, 2));
