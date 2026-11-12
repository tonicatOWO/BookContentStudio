import { cp, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";

execFileSync(process.execPath, ["node_modules/typescript/bin/tsc", "--noEmit", "false", "--outDir", "build"], { stdio: "inherit" });
await mkdir("build/desktop", { recursive: true });
for (const file of ["index.html", "styles.css", "preload.cjs"]) await cp(`src/desktop/${file}`, `build/desktop/${file}`);
console.log("Desktop application built: build/desktop/main.js");
