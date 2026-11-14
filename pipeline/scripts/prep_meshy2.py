"""Andrew's second Meshy route (2026-11-14): garments made on his own Meshy figures, exported re-centred and re-scaled, no mannequin.
python3 -I prep_meshy2.py   ->  in_clean/f_m2_*.npz  (P, F) ready for fit_clean.py
- sweaters: straightened (the line from the neck ring to the hem ring made vertical)
- bootie: one boot facing -x: turned toe-forward (+z) and mirrored into a pair
- jeans: as they are"""
import os,json,struct,numpy as np
H=os.path.dirname(os.path.abspath(__file__));IN=H+'/../in_meshy2';OUT=H+'/../in_clean'
CT={5126:np.float32,5125:np.uint32,5123:np.uint16};NC={'SCALAR':1,'VEC3':3}
def load(f):
    d=open(f,'rb').read();L=struct.unpack('<I',d[12:16])[0];J=json.loads(d[20:20+L]);B=d[20+L+8:]
    def acc(i):
        a=J['accessors'][i];bv=J['bufferViews'][a['bufferView']];n=NC[a['type']];return np.frombuffer(B,CT[a['componentType']],a['count']*n,bv.get('byteOffset',0)+a.get('byteOffset',0)).reshape(a['count'],n)
    p=[J['meshes'][n['mesh']] for n in J['nodes'] if 'mesh' in n][0]['primitives'][0];P=acc(p['attributes']['POSITION']).astype(float);F=acc(p['indices']).reshape(-1,3).astype(int)
    _,inv=np.unique(np.round(P*1e5).astype(np.int64),axis=0,return_inverse=True);inv=inv.ravel();W=np.zeros((inv.max()+1,3));W[inv]=P;F=inv[F];F=F[(F[:,0]!=F[:,1])&(F[:,1]!=F[:,2])&(F[:,0]!=F[:,2])]
    return W,F
def save(n,P,F):np.savez_compressed(OUT+'/'+n+'.npz',P=P.astype(np.float32),F=F.astype(np.int32));print(n,len(P),'points',len(F),'tris','size',np.ptp(P,0).round(3))
for n in ('sweater_tucked','sweater_untucked'):
    P,F=load(IN+'/'+n+'.glb');y0,y1=P[:,1].min(),P[:,1].max();h=y1-y0;mid=np.abs(P[:,0])<0.12*np.ptp(P[:,0])
    top=P[mid&(P[:,1]>y1-0.12*h)];bot=P[mid&(P[:,1]<y0+0.15*h)];ct=np.array([(top[:,2].max()+top[:,2].min())/2,top[:,1].mean()]);cb=np.array([(bot[:,2].max()+bot[:,2].min())/2,bot[:,1].mean()])
    a=np.arctan2(ct[0]-cb[0],ct[1]-cb[1]);a=float(os.environ.get('TILT_'+n.split('_')[1].upper(),a));c,s=np.cos(a),np.sin(a)   # rotate about x so that line is vertical
    P=np.c_[P[:,0],P[:,1]*c+P[:,2]*s,-P[:,1]*s+P[:,2]*c];print(' ',n,'straightened by %.1f deg'%np.degrees(a));save('f_m2_'+n,P,F)
P,F=load(IN+'/jeans.glb');save('f_m2_jeans',P,F)
P,F=load(IN+'/bootie.glb');P=np.c_[P[:,2],P[:,1],-P[:,0]]   # toe from -x to +z; the buckle ends up on +x: the left boot
gap=np.ptp(P[:,0])*0.75;L=P+[gap,0,0];R=L*[-1,1,1];save('f_m2_booties',np.r_[L,R],np.r_[F,F[:,::-1]+len(P)])
