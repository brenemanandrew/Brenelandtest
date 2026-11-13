import base64
s=open('/home/claude/poser/index.html').read()
def b64(p): return base64.b64encode(open(p,'rb').read()).decode()
models='\n'.join(f'<script type="application/octet-stream" id="{i}">{b64(p)}</script>' for i,p in [('glb-plus','/home/claude/out/base-plus-q3.glb')])
e=s.replace('<!--MODELS-->',models,1); open('/home/claude/poser/index_embedded.html','w').write(e)
t=e.replace('https://cdn.jsdelivr.net/npm/three@0.181.0/','/three/')
dbg=open('/home/claude/ptest/index.html').read()
a=dbg.index("window.__dbg={"); b=dbg.index("window.__poser={",a)
hook=dbg[a:b]
if 'window.__x=' not in hook: hook+="window.__x={loadRig,cache,RIGS,THREE,setWorldQuat,holder,get C(){return C;}};\n"
t=t.replace("window.__poser={",hook+"window.__poser={",1)
open('/home/claude/ptest/index.html','w').write(t)
print('embedded MB',round(len(e)/1e6,2))

import os,shutil
for root in ['/home/claude/poser/hair','/home/claude/ptest/hair']:
    os.makedirs(root,exist_ok=True)
    for f in os.listdir('/home/claude/out/hairfinal'):
        k=f[:-4];open(f'{root}/{k}.js','w').write("(window.HAIRDATA=window.HAIRDATA||{})['%s']='%s';"%(k,b64(f'/home/claude/out/hairfinal/{f}')))
print('hair files',len(os.listdir('/home/claude/poser/hair')))

for root in ['/home/claude/poser/models','/home/claude/ptest/models']:
    os.makedirs(root,exist_ok=True)
    open(root+'/male.js','w').write("(window.MODELDATA=window.MODELDATA||{})['male']='%s';"%b64('/home/claude/out/male-build-s.glb'))
print('male model MB',round(os.path.getsize('/home/claude/poser/models/male.js')/1e6,2))

for root in ['/home/claude/poser/hair','/home/claude/ptest/hair']:
    for f in os.listdir('/home/claude/out/beardfinal'):
        k=f[:-4];open(f'{root}/{k}.js','w').write("(window.HAIRDATA=window.HAIRDATA||{})['%s']='%s';"%(k,b64(f'/home/claude/out/beardfinal/{f}')))

for root in ['/home/claude/poser/models','/home/claude/ptest/models']:
    open(root+'/room.js','w').write("(window.MODELDATA=window.MODELDATA||{})['room']='%s';"%b64('/home/claude/out/room.glb'))
print('room MB',round(os.path.getsize('/home/claude/poser/models/room.js')/1e6,2))

import shutil
for root in ['/home/claude/poser/cloth','/home/claude/ptest/cloth']:
    shutil.rmtree(root,ignore_errors=True);os.makedirs(root,exist_ok=True)
    for f in os.listdir('/home/claude/out/wear'):
        k=f[:-4];open(f'{root}/{k}.js','w').write("(window.HAIRDATA=window.HAIRDATA||{})['%s']='%s';"%(k,b64(f'/home/claude/out/wear/{f}')))
print('cloth files',len(os.listdir('/home/claude/poser/cloth')),'total MB',round(sum(os.path.getsize('/home/claude/poser/cloth/'+f) for f in os.listdir('/home/claude/poser/cloth'))/1e6,1))

for root in ['/home/claude/poser/hair','/home/claude/ptest/hair']:
    for f in os.listdir('/home/claude/out/hairalt'):
        k=f[:-4];open(f'{root}/{k}.js','w').write("(window.HAIRDATA=window.HAIRDATA||{})['%s']='%s';"%(k,b64(f'/home/claude/out/hairalt/{f}')))
