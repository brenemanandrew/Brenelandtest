import sys,json,numpy as np;sys.path.insert(0,'/home/claude/pylib')
from PIL import Image
tag=sys.argv[1];ks=json.load(open(f'/home/claude/out/pc-{tag}.json'));s=float(sys.argv[2]) if len(sys.argv)>2 else 0.5
W=Image.new('RGB',(6*320,len(ks)*440))
for r,k in enumerate(ks):
    fr=[]
    for i in range(6):
        W.paste(Image.open(f'/home/claude/out/pc-{tag}-{r}-{i}.png'),(i*320,r*440))
        a=np.array(Image.open(f'/home/claude/out/pm-{tag}-{r}-{i}.png').convert('RGB')).astype(int);mg=(a[:,:,0]>215)&(a[:,:,2]>215)&(a[:,:,1]<a[:,:,0]-70);bgc=a[2,2];ch=(np.abs(a-bgc).sum(2)>40);fr.append(100*mg.sum()/max(ch.sum(),1))
    print('%-12s underlayer showing %% of figure, per view: %s  max %.1f'%(k,' '.join('%4.1f'%v for v in fr),max(fr)))
W.resize((int(W.width*s),int(W.height*s))).save(f'/home/claude/out/pcs-{tag}.png')
