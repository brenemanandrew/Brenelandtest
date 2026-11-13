import bpy, bmesh, sys, numpy as np
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=sys.argv[1])
o=[o for o in bpy.context.scene.objects if o.type=='MESH'][0]
me=o.data
print('verts',len(me.vertices),'polys',len(me.polygons))
for img in bpy.data.images: print(img.name, img.size[:])
bm=bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
# components
seen=set(); comps=[]
for v in bm.verts:
    if v.index in seen: continue
    st=[v]; c=[]; seen.add(v.index)
    while st:
        x=st.pop(); c.append(x.index)
        for e in x.link_edges:
            y=e.other_vert(x)
            if y.index not in seen: seen.add(y.index); st.append(y)
    comps.append(c)
co=np.array([v.co[:] for v in me.vertices])
comps.sort(key=len, reverse=True)
print('components',len(comps))
for c in comps[:12]:
    p=co[c]; print(len(c), p.min(0).round(3), p.max(0).round(3))
# slices along z
for z in np.arange(-0.95,0.96,0.05):
    m=(co[:,2]>z)&(co[:,2]<z+0.05); p=co[m]
    if len(p): print(round(z,2), len(p), 'x',p[:,0].min().round(3),p[:,0].max().round(3),'y',p[:,1].min().round(3),p[:,1].max().round(3))
