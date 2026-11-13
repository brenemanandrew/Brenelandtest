import bpy, bmesh, sys, numpy as np
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=sys.argv[1])
o=[o for o in bpy.context.scene.objects if o.type=='MESH'][0]
bm=bmesh.new(); bm.from_mesh(o.data)
r=bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
bm.verts.ensure_lookup_table()
print('after merge', len(bm.verts))
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
co=np.array([v.co[:] for v in bm.verts])
comps.sort(key=len, reverse=True)
print('components',len(comps))
for c in comps[:10]:
    p=co[c]; print(len(c), p.min(0).round(3), p.max(0).round(3))
nm=sum(1 for e in bm.edges if not e.is_manifold); print('nonmanifold edges',nm)
z=co[:,2]; print(np.histogram(z[z<-0.85],bins=20))
