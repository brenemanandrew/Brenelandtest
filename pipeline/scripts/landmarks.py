import bpy, sys, numpy as np, json
bpy.ops.wm.open_mainfile(filepath=sys.argv[1])
o=bpy.data.objects['Belinda']; me=o.data
co=np.array([v.co[:] for v in me.vertices])
# vertex colour class from the base colour texture
img=[i for i in bpy.data.images if i.size[0]>0][0]
mat=me.materials[0]
for n in mat.node_tree.nodes:
    if n.type=='BSDF_PRINCIPLED':
        l=n.inputs['Base Color'].links
        if l: img=l[0].from_node.image
W,H=img.size; px=np.array(img.pixels[:]).reshape(H,W,4)
uv=np.zeros((len(co),2)); uvl=me.uv_layers[0].data
for p in me.polygons:
    for li,vi in zip(p.loop_indices,p.vertices): uv[vi]=uvl[li].uv[:]
xi=np.clip((uv[:,0]%1)*W,0,W-1).astype(int); yi=np.clip((uv[:,1]%1)*H,0,H-1).astype(int)
col=px[yi,xi,:3]
r,g,b=col[:,0],col[:,1],col[:,2]
dark=col.max(1)<0.06
green=(g>r*1.2)&(g>b*0.9)&~dark
cls=np.where(dark&(co[:,2]>1.2),'hair',np.where(dark&(co[:,2]<0.3),'shoe',np.where(green,'dress','skin')))
np.save('/home/claude/out/cls.npy',cls)
for c in ['hair','shoe','dress','skin']: 
    m=cls==c; print(c,m.sum(), co[m].min(0).round(2) if m.any() else '', co[m].max(0).round(2) if m.any() else '')
def refine(p,mask,r,it=4):
    p=np.array(p,float)
    for _ in range(it):
        d=np.linalg.norm(co-p,axis=1); m=mask&(d<r)
        if m.sum()<5: break
        p=co[m].mean(0)
    return p.round(3).tolist(), int(m.sum())
skin=(cls=='skin')|(cls=='shoe')
L=co[:,0]>0.0; R=co[:,0]<0.0
est={'calf_l':((0.08,-0.25,0.54),L,0.06),'foot_l':((0.19,0.0,0.14),L&skin,0.05),
     'calf_r':((-0.13,0.05,0.45),R,0.06),'foot_r':((-0.1,0.07,0.08),R&skin,0.05),
     'lowerarm_r':((-0.36,0.06,1.08),R&(co[:,0]<-0.25),0.05),'hand_r':((-0.41,0.06,0.86),R&(co[:,0]<-0.3),0.04),
     'lowerarm_l':((0.26,0.0,1.17),L&(co[:,0]>0.18),0.05),'hand_l':((0.31,-0.08,1.42),L&(co[:,0]>0.2),0.04)}
for k,(p,m,r) in est.items(): print(k,p,'->',*refine(p,m&skin,r))
def stats(name,m):
    c=col[m]; print(name, m.sum(), 'mean',c.mean(0).round(3),'p10',np.percentile(c.max(1),10).round(3),'p90',np.percentile(c.max(1),90).round(3))
stats('backhead', (co[:,1]>0.12)&(co[:,2]>1.55))
stats('shoes', (co[:,2]<0.04))
stats('skirt', (co[:,2]>0.7)&(co[:,2]<0.9)&(np.abs(co[:,1])>0.25))
stats('face', (co[:,1]<-0.1)&(co[:,2]>1.6)&(np.abs(co[:,0])<0.05))
