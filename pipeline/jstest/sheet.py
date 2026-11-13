import sys,glob;sys.path.insert(0,'/home/claude/pylib')
from PIL import Image
tag=sys.argv[1];n=0
while glob.glob(f'/home/claude/out/rv-{tag}-{n}-0.png'):n+=1
W=Image.new('RGB',(6*300,n*600))
for r in range(n):
  for i in range(6):
    try:W.paste(Image.open(f'/home/claude/out/rv-{tag}-{r}-{i}.png'),(i*300,r*600))
    except Exception as e:pass
s=float(sys.argv[2]) if len(sys.argv)>2 else 1
W.resize((int(W.width*s),int(W.height*s))).save(f'/home/claude/out/rvs-{tag}.png')
