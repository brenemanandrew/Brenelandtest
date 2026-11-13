import bpy, sys, math, numpy as np
from mathutils import Vector
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath='in4/leia2.glb')
o=[x for x in bpy.data.objects if x.type=='MESH'][0]
bpy.context.view_layer.objects.active=o;o.select_set(True)
bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
me=o.data;print('tris',sum(len(p.vertices)-2 for p in me.polygons))
# merge split verts, then decimate
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.remove_doubles(threshold=1e-5);bpy.ops.object.mode_set(mode='OBJECT')
m=o.modifiers.new('dec','DECIMATE');m.ratio=float(sys.argv[-1]);bpy.ops.object.modifier_apply(modifier='dec')
co=np.array([v.co[:] for v in o.data.vertices]);print('verts',len(co),'min',co.min(0),'max',co.max(0),'tris',sum(len(p.vertices)-2 for p in o.data.polygons))
o.name='Leia2'
bpy.ops.wm.save_as_mainfile(filepath='/home/claude/out/leia2_dec.blend')
