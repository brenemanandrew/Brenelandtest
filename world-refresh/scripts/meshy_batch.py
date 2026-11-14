"""Run a batch of Meshy Text to 3D jobs: preview (mesh) then refine (base colour texture), download GLB + thumbnail.
Usage: python3 meshy_batch.py PROMPTS_MD OUTDIR   (PROMPTS_MD in the AUTOMATE-PART1.md format)
The API key is injected by the session's network proxy; no key is read here. State is kept in OUTDIR/meshy_tasks.json so a rerun resumes."""
import json, re, sys, time, os, urllib.request, urllib.error
API = 'https://api.meshy.ai/openapi/v2/text-to-3d'
H = {'Authorization': 'Bearer proxy-injected', 'Content-Type': 'application/json'}
def req(method, url, body=None):
    for a in range(8):
        try:
            r = urllib.request.Request(url, data=json.dumps(body).encode() if body else None, headers=H, method=method)
            return json.load(urllib.request.urlopen(r, timeout=60))
        except urllib.error.HTTPError as e:
            msg = e.read().decode()[:300]
            if e.code == 429 or e.code >= 500: time.sleep(10 * (a + 1)); continue
            raise RuntimeError(f'{e.code} {msg}')
        except Exception as e:
            time.sleep(5 * (a + 1))
    raise RuntimeError('gave up ' + url)
src, out = sys.argv[1], sys.argv[2]
items = re.findall(r'\d+\. (\S+) .*? - polycount (\d+)[^,]*, texture \d+ px, save as (\S+)\n\s+Prompt: (.+)', open(src).read())
stf = os.path.join(out, 'meshy_tasks.json')
st = json.load(open(stf)) if os.path.exists(stf) else {}
save = lambda: json.dump(st, open(stf, 'w'), indent=1)
for k, poly, fn, prompt in items:
    s = st.setdefault(fn, {'id': k})
    if 'preview' not in s:
        s['preview'] = req('POST', API, {'mode': 'preview', 'prompt': prompt, 'ai_model': 'latest', 'should_remesh': True,
                                          'topology': 'triangle', 'target_polycount': max(100, int(poly)), 'target_formats': ['glb']})['result']
        save(); print('preview', fn, s['preview'], flush=True)
while True:
    busy = 0
    for k, poly, fn, prompt in items:
        s = st[fn]
        if s.get('done') or s.get('failed'): continue
        busy += 1
        if 'refine' not in s:
            t = req('GET', f"{API}/{s['preview']}")
            if t['status'] == 'SUCCEEDED':
                s['refine'] = req('POST', API, {'mode': 'refine', 'preview_task_id': s['preview'], 'enable_pbr': False,
                                                 'texture_prompt': prompt[:800], 'texture_resolution': '2k', 'target_formats': ['glb']})['result']
                print('refine', fn, flush=True)
            elif t['status'] in ('FAILED', 'CANCELED'):
                s['failed'] = f"preview {t['status']} {t.get('task_error')}"; print('FAIL', fn, s['failed'], flush=True)
        else:
            t = req('GET', f"{API}/{s['refine']}")
            if t['status'] == 'SUCCEEDED':
                urllib.request.urlretrieve(t['model_urls']['glb'], os.path.join(out, fn))
                if t.get('thumbnail_url'): urllib.request.urlretrieve(t['thumbnail_url'], os.path.join(out, fn[:-4] + '_thumb.png'))
                s['done'] = True; s['credits'] = t.get('consumed_credits'); print('DONE', fn, flush=True)
            elif t['status'] in ('FAILED', 'CANCELED'):
                s['failed'] = f"refine {t['status']} {t.get('task_error')}"; print('FAIL', fn, s['failed'], flush=True)
        save()
    if not busy: break
    time.sleep(20)
print('ALL FINISHED', sum(1 for v in st.values() if v.get('done')), 'done,', sum(1 for v in st.values() if v.get('failed')), 'failed')
