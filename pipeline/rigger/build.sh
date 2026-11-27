#!/bin/sh
# Packs the rigger into one file, rigger.html, that opens with a double-click and needs no internet.
# Needs node, and the packages three and esbuild somewhere node can find them: run it from a folder that has them in node_modules, e.g.
#   mkdir /tmp/rigbuild && cd /tmp/rigbuild && npm i three@0.187 esbuild && sh /path/to/pipeline/rigger/build.sh
set -e
here="$(cd "$(dirname "$0")" && pwd)"
NODE_PATH="$PWD/node_modules" ./node_modules/.bin/esbuild "$here/src/main.js" --bundle --format=iife --minify --charset=ascii --legal-comments=none --outfile=/tmp/rigger-bundle.js
python3 - "$here" <<'PY'
import sys
here = sys.argv[1]
page = open(here + '/src/page.html', encoding='utf8').read()
js = open('/tmp/rigger-bundle.js', encoding='utf8').read().replace('</script', '<\\/script')
open(here + '/rigger.html', 'w', encoding='utf8').write(page.replace('/*BUNDLE*/', js))
print('rigger.html', round(len(page) / 1e3 + len(js) / 1e3), 'KB')
PY
