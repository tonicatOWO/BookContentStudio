#!/bin/sh
# Build dependencies are installed only inside the disposable Ubuntu container.
# Mount the project at /work (read-only), /work/dist writable, and the installed
# Playwright browser cache at /browser-cache (read-only).
set -eu
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl xz-utils fontconfig fonts-noto-cjk
mkdir -p /opt/node
cd /tmp
curl -fLsS https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt -o SHASUMS256.txt
archive=$(awk '$2 ~ /^node-v22.*-linux-x64.tar.xz$/ { print $2 }' SHASUMS256.txt)
test -n "$archive"
curl -fLsS "https://nodejs.org/dist/latest-v22.x/$archive" -o "$archive"
awk -v name="$archive" '$2 == name' SHASUMS256.txt | sha256sum -c -
tar -xJf "$archive" -C /opt/node --strip-components=1
export PATH="/opt/node/bin:$PATH"
export PLAYWRIGHT_BROWSERS_PATH=/browser-cache
cd /work
node node_modules/playwright/cli.js install-deps chromium
node scripts/build-portable.mjs
