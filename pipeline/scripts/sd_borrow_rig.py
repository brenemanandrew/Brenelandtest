"""Give an unrigged SD model the rig of a Meshy-rigged one of the same character (Andrew: "use the rig in this one to do the other model").
python3 sd_borrow_rig.py FROM TO      e.g. untucked_m french  -> in_sd/french_m.npz  (weights from the nearest skin of FROM, FROM's joints)"""
import sys,os,json,numpy as np
from scipy.spatial import cKDTree
H=os.path.dirname(os.path.abspath(__file__))+'/../in_sd/';a,b=sys.argv[1],sys.argv[2]
A=np.load(H+a+'.npz');B=np.load(H+b+'.npz')
def norm(P):
    P=P.astype(float);s=1.80/np.ptp(P[:,1]);Q=P*s;Q[:,1]-=Q[:,1].min();Q[:,0]-=(Q[:,0].max()+Q[:,0].min())/2;return Q,s
PA,sa=norm(A['P']);PB,sb=norm(B['P']);d,k=cKDTree(PA).query(PB,k=4);w=1/(d+1e-3);w/=w.sum(1,keepdims=True);W=(A['W'][k]*w[:,:,None]).sum(1)
J={n:[v[0]*sa/sb,v[1]*sa/sb,v[2]*sa/sb] for n,v in json.loads(str(A['J'])).items()}
np.savez_compressed(H+b+'_m.npz',P=B['P'],UV=B['UV'],N=B['N'],F=B['F'],W=W.astype(np.float32),J=json.dumps(J))
import shutil;shutil.copy(H+b+'.jpg',H+b+'_m.jpg');print('  %s_m: rig borrowed from %s (median distance to its skin %.1f mm, 95%% %.1f mm)'%(b,a,np.median(d[:,0])*1000,np.percentile(d[:,0],95)*1000))
