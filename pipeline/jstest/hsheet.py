import sys,glob;sys.path.insert(0,'/home/claude/pylib')
from PIL import Image
tag=sys.argv[1];n=0
while glob.glob(f'/home/claude/out/hr-{tag}-{n}-0.png'):n+=1
s=float(sys.argv[2]) if len(sys.argv)>2 else 0.5;c=int(sys.argv[3]) if len(sys.argv)>3 else 2;r_=(n+c-1)//c
W=Image.new('RGB',(c*5*360,r_*360))
for r in range(n):
  for i in range(5):
    try:W.paste(Image.open(f'/home/claude/out/hr-{tag}-{r}-{i}.png'),((r%c)*1800+i*360,(r//c)*360))
    except Exception:pass
W.resize((int(W.width*s),int(W.height*s))).save(f'/home/claude/out/hrs-{tag}.png')
