import bpy,sys
src,dst=sys.argv[-2],sys.argv[-1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=src,automatic_bone_orientation=False)
for a in bpy.data.actions:print('action',a.name,a.frame_range[:])
print('objects',[(o.name,o.type,tuple(o.scale)) for o in bpy.data.objects])
bpy.ops.export_scene.gltf(filepath=dst,export_format='GLB',export_animations=True,export_skins=True,export_force_sampling=True,export_frame_step=1)
