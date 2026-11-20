#!/bin/sh
# Run before every commit: every script in the app has to parse. Exits non-zero on the first that does not.
set -e
cd "$(dirname "$0")/.."
for f in server.mjs persona.mjs away.mjs pics.mjs movies.mjs dnd.mjs public/*.js bridge/*.mjs; do node --check "$f"; done
for page in public/dev.html public/mocap.html; do sed -n '/<script type="module">/,/<\/script>/p' "$page" | sed '1d;$d' > /tmp/check-page.mjs; node --check /tmp/check-page.mjs; done
python3 - <<'PY'
import re,subprocess,sys
s=open('public/index.html').read()
blocks=re.findall(r'<script>(.*?)</script>',s,flags=re.S)
big=max(blocks,key=len); open('/tmp/check-index.js','w').write(big)
sys.exit(subprocess.call(['node','--check','/tmp/check-index.js']))
PY
echo "all scripts parse"
