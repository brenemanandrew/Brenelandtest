#!/bin/sh
# One-time setup in a fresh Linux workspace. The scripts use fixed paths under /home/claude, so this links the repo's folders there.
set -e
R="$(cd "$(dirname "$0")" && pwd)"
mkdir -p /home/claude/ptest /home/claude/pylib /home/claude/out
for d in scripts poser jstest; do [ -e /home/claude/$d ] || ln -s "$R/$d" /home/claude/$d; done
cp -rn "$R/out/." /home/claude/out/
[ -d /home/claude/bvenv ] || python3 -m venv /home/claude/bvenv
/home/claude/bvenv/bin/pip install -q bpy numpy
python3 -m pip install -q --break-system-packages --target /home/claude/pylib pillow
(cd /home/claude/jstest && npm install --silent puppeteer-core)
echo "ready: python3 /home/claude/scripts/build.py"
