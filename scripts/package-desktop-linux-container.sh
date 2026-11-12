#!/bin/sh
# /work read-only, /work/dist writable; needs the previously verified CLI runtime.
set -eu
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y libgtk-3-0
export LD_LIBRARY_PATH="/work/$1/lib"
cd /work
"$1/runtime/node" scripts/package-desktop.mjs --runtime "$1"
