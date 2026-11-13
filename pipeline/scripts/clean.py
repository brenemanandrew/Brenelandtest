import bpy, bmesh, sys, numpy as np
from mathutils import Vector
src, out = sys.argv[1], sys.argv[2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
o=[o for o in bpy.context.scene.objects if o.type=='MESH'][0]
o.name='Belinda'; o.data.name='Belinda'
bm=bmesh.new(); bm.from_mesh(o.data)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
ZC=-0.9152
r=bmesh.ops.bisect_plane(bm, geom=bm.verts[:]+bm.edges[:]+bm.faces[:], plane_co=(0,0,ZC), plane_no=(0,0,1), clear_inner=True)
bnd=[e for e in bm.edges if e.is_boundary]
print('boundary edges after cut', len(bnd))
bmesh.ops.holes_fill(bm, edges=bnd, sides=0)
print('boundary after fill', sum(1 for e in bm.edges if e.is_boundary))
for v in bm.verts: v.co.z -= ZC
bm.to_mesh(o.data); bm.free()
print('verts', len(o.data.vertices), 'tris', sum(len(p.vertices)-2 for p in o.data.polygons))
md=o.modifiers.new('dec','DECIMATE'); md.ratio=0.16; md.use_collapse_triangulate=True
bpy.context.view_layer.objects.active=o
bpy.ops.object.modifier_apply(modifier='dec')
for p in o.data.polygons: p.use_smooth=True
print('after dec verts', len(o.data.vertices), 'tris', len(o.data.polygons))
co=np.array([v.co[:] for v in o.data.vertices]); print('bounds', co.min(0).round(3), co.max(0).round(3))
bpy.ops.wm.save_as_mainfile(filepath=out)
