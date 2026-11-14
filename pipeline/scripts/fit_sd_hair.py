"""Place Andrew's Meshy hairstyles on an SD model's head -> out/sd/hair/sdh_HAIR_BODY.glb (+ hair/*.js for the creator)
python3 fit_sd_hair.py BODY [HAIR ...]         BODY: french | untucked | base
Each style is exported at its own size, so it is scaled and set by a few numbers per style (TAB): how wide its cap is (in its own
units), how far below its top the top of the skull sits (buns and knots stand above), and small nudges. Colours: hair-coloured
points become light greys on the 'hair' material (the creator tints it with the chosen hair colour); ties, clips and skin keep theirs."""
import sys,os,io,json,struct,base64,numpy as np
from PIL import Image
H=os.path.dirname(os.path.abspath(__file__));body=sys.argv[1];ENV=lambda k,d:type(d)(os.environ.get(k,d))
#        cap width, skull top below hair top, dz, dy, extra scale        (hair's own units)
TAB={'bob':(1.90,0.02,0.0,0.0,1.08),'pigtails':(1.23,0.02,0.0,0.0,1.0),'pixie':(1.60,0.02,0.0,0.0,1.0),'ponytail':(1.04,0.30,0.0,0.0,1.0),'puffs':(1.52,0.40,0.0,0.0,1.0),'wavy':(0.95,0.02,0.0,0.0,1.0)}
if os.environ.get('TAB'):TAB.update({k:tuple(v) for k,v in json.loads(os.environ['TAB']).items()})
R=np.load(H+'/../out/sd/body_sd_%s_rest.npz'%body);BP=R['P'].astype(float);ny=float(R['joints'][list(R['names']).index('Head')][1]);hd=BP[BP[:,1]>ny+0.06]
top=hd[:,1].max();hw=np.ptp(hd[np.abs(hd[:,1]-(top-0.2))<0.05,0]);hz=(hd[:,2].max()+hd[:,2].min())/2;hx=(hd[:,0].max()+hd[:,0].min())/2
os.makedirs(H+'/../out/sd/hair',exist_ok=True)
for h in (sys.argv[2:] or list(TAB)):
    Z=np.load(H+'/../in_sd/hair_%s.npz'%h);P=Z['P'].astype(float);UV=Z['UV'];N=Z['N'].astype(float);F=Z['F'].astype(int)
    T=np.asarray(Image.open(H+'/../in_sd/hair_%s.jpg'%h).convert('RGB')).astype(float);th,tw=T.shape[:2];col=T[np.clip((UV[:,1]%1*th).astype(int),0,th-1),np.clip((UV[:,0]%1*tw).astype(int),0,tw-1)]
    cw,drop,dz,dy,ks=TAB[h];s=hw*ENV('OVER',1.10)/cw*ks
    P=P*s;P[:,0]+=hx-(P[:,0].max()+P[:,0].min())/2;P[:,1]+=top+ENV('UP',0.015)+dy-(P[:,1].max()-drop*s);P[:,2]+=hz+dz-(P[:,2].max()+P[:,2].min())/2
    med=np.median(col,0);lum=col.mean(1,keepdims=True).clip(1);chro=np.abs(col/lum-med/med.mean()).max(1);acc=chro>ENV('ACC',0.22)   # not hair-coloured: ties, a dyed streak, skin
    # Meshy made these from a front view: the scalp is often left skin-coloured (a bald back) and a wall can run across the face.
    skin=acc&(col[:,0]>col[:,1]*1.15)&(col[:,1]>col[:,2]*1.1)&(col.mean(1)>med.mean()*1.25)&(col[:,2]<200)   # warm and lighter than the hair: scalp, not a tie
    acc&=~skin;grey=np.clip(col.mean(1)/med.mean(),0.35,1.6)/1.6;grey[skin]=1/1.6;vc=np.where(acc[:,None],col/255.0,grey[:,None].repeat(3,1));fa=acc[F].sum(1)>=2
    EY=ENV('EYEY',top-0.245);fc=P[F].mean(1);win=(np.abs(fc[:,0]-hx)<ENV('WINX',0.2))&(fc[:,1]<EY+ENV('WINUP',0.075))&(fc[:,1]>ny-0.14)&(fc[:,2]>hz+0.04)   # nothing over the face below the brows
    F=F[~win];fa=fa[~win]
    # a cap of hair on the skull itself (several of the styles have no scalp at all: bald from behind)
    # the scalp under the hair, drawn in the hair colour right on the skull (4 mm out), cut along a smooth hairline: higher at the
    # centre of the forehead, coming down at the temples, round behind the ears and across the nape
    BF=R['F'].astype(int);xr=np.abs(BP[:,0]-hx)/(hw/2)
    front=BP[:,1]-(EY+ENV('CAPUP',0.115)-ENV('TEMPLE',0.05)*np.clip(xr,0,1)**2);back=np.minimum((hz-0.015)-BP[:,2],BP[:,1]-(EY-ENV('CAPLOW',0.10)))
    fld=np.maximum(front,back);fld=np.minimum(fld,BP[:,1]-(ny+0.04));fld=np.minimum(fld,(hw*ENV('CAPSIDE',0.485)-np.abs(BP[:,0]-hx))*2)   # (not the ears)
    fld=np.where(np.abs(fld)<1e-7,-1e-7,fld);nearF=(BP[BF][:,:,1].max(1)>ny);Fc=BF[nearF];pos=fld[Fc]>0;n_=pos.sum(1);full=Fc[n_==3];mx=Fc[(n_==1)|(n_==2)];nm=n_[(n_==1)|(n_==2)]
    fn=np.cross(BP[BF[:,1]]-BP[BF[:,0]],BP[BF[:,2]]-BP[BF[:,0]]);BN=np.zeros_like(BP)
    for q in range(3):np.add.at(BN,BF[:,q],fn)
    BN/=np.linalg.norm(BN,axis=1,keepdims=True).clip(1e-12)
    lone=np.where(nm==1,np.argmax(fld[mx]>0,1),np.argmin(fld[mx]>0,1));r_=np.arange(len(mx));A_=mx[r_,lone];B_=mx[r_,(lone+1)%3];C_=mx[r_,(lone+2)%3]
    Es=np.sort(np.r_[np.c_[A_,B_],np.c_[A_,C_]],1);ue,inv=np.unique(Es,axis=0,return_inverse=True);inv=inv.ravel();i_,j_=ue[:,0],ue[:,1];t_=np.clip(fld[i_]/(fld[i_]-fld[j_]),1e-3,1-1e-3)[:,None]
    XP=np.r_[BP,BP[i_]+(BP[j_]-BP[i_])*t_];XN=np.r_[BN,BN[i_]+(BN[j_]-BN[i_])*t_];XN/=np.linalg.norm(XN,axis=1,keepdims=True).clip(1e-12);nid=len(BP)+np.arange(len(ue));p_=nid[inv[:len(mx)]];q_=nid[inv[len(mx):]];ins=nm==1
    CF=np.r_[full,np.c_[A_,p_,q_][ins],np.c_[p_,B_,C_][~ins],np.c_[p_,C_,q_][~ins]];cu=np.unique(CF);cm=-np.ones(len(XP),int);cm[cu]=len(P)+np.arange(len(cu))
    P=np.r_[P,XP[cu]+XN[cu]*ENV('CAPOUT',0.004)];N=np.r_[N,XN[cu]];vc=np.r_[vc,np.full((len(cu),3),0.9/1.6)];F=np.r_[F,cm[CF]];fa=np.r_[fa,np.zeros(len(CF),bool)]
    BIN=bytearray();views=[];accs=[]
    def add(arr,comp,typ,mm=False,norm=False):
        while len(BIN)%4:BIN.append(0)
        views.append({'buffer':0,'byteOffset':len(BIN),'byteLength':arr.nbytes});BIN.extend(arr.tobytes());a={'bufferView':len(views)-1,'componentType':comp,'type':typ,'count':int(arr.shape[0])}
        if mm:a['min']=[float(x) for x in arr.min(0)];a['max']=[float(x) for x in arr.max(0)]
        if norm:a['normalized']=True
        accs.append(a);return len(accs)-1
    at={'POSITION':add(P.astype(np.float32),5126,'VEC3',True),'NORMAL':add(N.astype(np.float32),5126,'VEC3'),'COLOR_0':add((vc.clip(0,1)*255).astype(np.uint8),5121,'VEC3',norm=True)}
    prims=[{'attributes':at,'indices':add(F[~fa].astype(np.uint32).reshape(-1),5125,'SCALAR'),'material':0}]
    if fa.any():prims.append({'attributes':at,'indices':add(F[fa].astype(np.uint32).reshape(-1),5125,'SCALAR'),'material':1})
    while len(BIN)%4:BIN.append(0)
    GJ={'asset':{'version':'2.0'},'scene':0,'scenes':[{'nodes':[0]}],'nodes':[{'name':'hair','mesh':0}],'meshes':[{'primitives':prims}],'materials':[{'name':'hair','doubleSided':True},{'name':'accessory','doubleSided':True}],'bufferViews':views,'accessors':accs,'buffers':[{'byteLength':len(BIN)}]}
    js=json.dumps(GJ,separators=(',',':')).encode()
    while len(js)%4:js+=b' '
    g=struct.pack('<III',0x46546C67,2,28+len(js)+len(BIN))+struct.pack('<II',len(js),0x4E4F534A)+js+struct.pack('<II',len(BIN),0x004E4942)+bytes(BIN);k='sdh_%s_%s'%(h,body)
    open(H+'/../out/sd/hair/%s.glb'%k,'wb').write(g)
    for d in ('/../../site/hair','/../poser/hair'):
        os.makedirs(H+d,exist_ok=True);open(H+d+'/%s.js'%k,'w').write("(window.HAIRDATA=window.HAIRDATA||{})['%s']='%s';"%(k,base64.b64encode(g).decode()))
    print('  %s on %s: scale %.3f, %d points, %d%% kept in its own colour (ties etc)'%(h,body,s,len(P),round(100*fa.mean())))
