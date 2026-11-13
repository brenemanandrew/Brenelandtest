import bpy, sys, numpy as np, math, json
from mathutils import Vector, Matrix, Quaternion
src, out = sys.argv[1], sys.argv[2]
bpy.ops.wm.open_mainfile(filepath=src)
o=bpy.data.objects['Belinda']; me=o.data
co=np.array([v.co[:] for v in me.vertices])
# ---- vertex classes from the base colour texture
mat=me.materials[0]; img=None
for n in mat.node_tree.nodes:
    if n.type=='BSDF_PRINCIPLED' and n.inputs['Base Color'].links: img=n.inputs['Base Color'].links[0].from_node.image
W,H=img.size; px=np.array(img.pixels[:]).reshape(H,W,4)
uvs=[[] for _ in co]; uvl=me.uv_layers[0].data
for p in me.polygons:
    for li,vi in zip(p.loop_indices,p.vertices): uvs[vi].append(uvl[li].uv[:])
col=np.zeros((len(co),3))
for i,us in enumerate(uvs):
    c=[px[min(H-1,int((u[1]%1)*H)),min(W-1,int((u[0]%1)*W)),:3] for u in us]; col[i]=np.median(c,axis=0)
mx=col.max(1)
hair=(co[:,2]>1.25)&(mx<0.32)&~((col[:,0]>col[:,2]*1.3)&(mx>0.2))&~(col[:,1]>col[:,0]*1.08)
dress=(col[:,1]>col[:,0]*1.15)
# majority smoothing over neighbours
nb=[[] for _ in co]
for e in me.edges: a,b=e.vertices; nb[a].append(b); nb[b].append(a)
for _ in range(2):
    hair=np.array([ (hair[i]+hair[n].sum())/(1+len(n))>0.5 if n else hair[i] for i,n in enumerate(nb)])
    dress=np.array([ (dress[i]+dress[n].sum())/(1+len(n))>0.5 if n else dress[i] for i,n in enumerate(nb)])
print('hair',hair.sum(),'dress',dress.sum())

# ---- feet axes from the shoes
def foot_axis(mask, ankle):
    p=co[mask]; c=p.mean(0); u,s,vt=np.linalg.svd(p-c); d=vt[0]
    t=(p-c)@d; ends=[c+d*t.min(), c+d*t.max()]
    toe=max(ends,key=lambda e: np.linalg.norm(e-np.array(ankle)))
    return toe
ankL=(0.205,0.0,0.14); ankR=(-0.09,0.07,0.075)
shoeL=(co[:,2]<0.22)&(co[:,0]>0.11)&(co[:,1]<0.03)&(mx<0.25)
shoeR=(co[:,2]<0.07)&(co[:,0]<0.06)&(mx<0.25)
toeL=foot_axis(shoeL,ankL); toeR=foot_axis(shoeR,ankR)
print('toeL',toeL.round(3),'toeR',toeR.round(3), shoeL.sum(), shoeR.sum())
def lerp(a,b,t): return tuple(np.array(a)+(np.array(b)-np.array(a))*t)
ballL=lerp(ankL,toeL,0.7); ballR=lerp(ankR,toeR,0.7)
J={ # head, tail, parent
 'root':((0,0.03,0),(0,0.03,0.2),None),
 'pelvis':((0,0.03,0.90),(0,0.03,1.02),'root'),
 'spine_01':((0,0.03,1.02),(0,0.035,1.13),'pelvis'),
 'spine_02':((0,0.035,1.13),(0,0.04,1.25),'spine_01'),
 'spine_03':((0,0.04,1.25),(0,0.045,1.40),'spine_02'),
 'neck_01':((0,0.045,1.40),(0,0.04,1.50),'spine_03'),
 'head':((0,0.04,1.50),(0,0.04,1.80),'neck_01'),
 'clavicle_l':((0.03,0.03,1.38),(0.18,0.05,1.37),'spine_03'),
 'upperarm_l':((0.19,0.05,1.36),(0.265,0.01,1.17),'clavicle_l'),
 'lowerarm_l':((0.265,0.01,1.17),(0.29,-0.075,1.40),'upperarm_l'),
 'hand_l':((0.29,-0.075,1.40),(0.37,-0.11,1.53),'lowerarm_l'),
 'clavicle_r':((-0.03,0.03,1.38),(-0.18,0.05,1.37),'spine_03'),
 'upperarm_r':((-0.19,0.05,1.36),(-0.362,0.056,1.088),'clavicle_r'),
 'lowerarm_r':((-0.362,0.056,1.088),(-0.40,0.05,0.875),'upperarm_r'),
 'hand_r':((-0.40,0.05,0.875),(-0.44,0.03,0.775),'lowerarm_r'),
 'thigh_l':((0.09,0.02,0.86),(0.075,-0.27,0.53),'pelvis'),
 'calf_l':((0.075,-0.27,0.53),ankL,'thigh_l'),
 'foot_l':(ankL,ballL,'calf_l'),
 'ball_l':(ballL,tuple(toeL),'foot_l'),
 'thigh_r':((-0.09,0.03,0.86),(-0.135,0.0,0.45),'pelvis'),
 'calf_r':((-0.135,0.0,0.45),ankR,'thigh_r'),
 'foot_r':(ankR,ballR,'calf_r'),
 'ball_r':(ballR,tuple(toeR),'foot_r'),
}
arm=bpy.data.armatures.new('BelindaRig'); ao=bpy.data.objects.new('Belinda_rig',arm)
bpy.context.scene.collection.objects.link(ao)
bpy.context.view_layer.objects.active=ao; ao.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
for n,(h,t,p) in J.items():
    b=arm.edit_bones.new(n); b.head=h; b.tail=t
    if p: b.parent=arm.edit_bones[p]; b.use_connect=False
    d=(Vector(t)-Vector(h)).normalized()
    b.align_roll(Vector((0,0,1)) if abs(d.z)<0.5 and n.startswith(('foot','ball')) else Vector((0,-1,0)))
bpy.ops.object.mode_set(mode='OBJECT')
# ---- automatic (heat) weights
for x in bpy.context.selected_objects: x.select_set(False)
o.select_set(True); ao.select_set(True); bpy.context.view_layer.objects.active=ao
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
names=[g.name for g in o.vertex_groups]
Wt=np.zeros((len(co),len(names)))
for v in me.vertices:
    for g in v.groups: Wt[v.index,g.group]=g.weight
print('unweighted after heat', int((Wt.sum(1)<1e-6).sum()))
ix={n:i for i,n in enumerate(names)}
# nearest-weighted fill for any vertex heat missed
miss=np.where(Wt.sum(1)<1e-6)[0]
if len(miss):
    good=np.where(Wt.sum(1)>=1e-6)[0]
    from mathutils.kdtree import KDTree
    kd=KDTree(len(good))
    for k,i in enumerate(good): kd.insert(co[i],k)
    kd.balance()
    for i in miss: Wt[i]=Wt[good[kd.find(co[i])[1]]]
# hair: head and neck only
keep=np.zeros(len(names)); keep[ix['head']]=1; keep[ix['neck_01']]=1
h=np.where(hair)[0]; Wt[h]*=keep
Wt[h[Wt[h].sum(1)<1e-6], ix['head']]=1
# skirt: half of the thighs' share moves to the pelvis (the skirt hangs from the waist)
s=np.where(dress&(co[:,2]<0.92))[0]
for side in 'lr':
    for b in ('thigh_','calf_'):
        j=ix[b+side]; k=0.7 if b=='thigh_' else 1.0
        Wt[s,ix['pelvis']]+=Wt[s,j]*k; Wt[s,j]*=(1-k)
# smooth the skirt's weights so neighbouring hem vertices move together (no spikes)
from mathutils.kdtree import KDTree as _KD
di=np.where(dress&(co[:,2]<0.98))[0]; kd2=_KD(len(di))
for k,i in enumerate(di): kd2.insert(co[i],k)
kd2.balance()
near=np.zeros(len(co),bool)
for i in np.where(~dress&(co[:,2]>0.40)&(co[:,2]<0.98)&~hair)[0]:
    if kd2.find(co[i])[2]<0.045: near[i]=True
print('skin under the skirt', near.sum())
sk=(dress&(co[:,2]<0.98))|near; ski=np.where(sk)[0]
for _ in range(25):
    Wn=Wt.copy()
    for i in ski:
        n=[j for j in nb[i] if sk[j]]
        if n: Wn[i]=0.5*Wt[i]+0.5*Wt[n].mean(0)
    Wt=Wn
# 4 influences, normalised
for i in range(len(co)):
    w=Wt[i]; top=np.argsort(w)[-4:]; m=np.zeros_like(w); m[top]=w[top]; Wt[i]=m/m.sum()
for g in o.vertex_groups: g.remove(range(len(co)))
for j,g in enumerate(o.vertex_groups):
    nz=np.where(Wt[:,j]>1e-4)[0]
    for i in nz: g.add([int(i)],float(Wt[i,j]),'REPLACE')
np.save('/home/claude/out/hair.npy',hair); np.save('/home/claude/out/dress.npy',dress)
bpy.ops.wm.save_as_mainfile(filepath=out)
print('saved')
