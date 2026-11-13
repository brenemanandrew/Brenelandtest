import bpy,sys
src,dst,ratio=sys.argv[-3],sys.argv[-2],float(sys.argv[-1])
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=src,merge_vertices=True)
o=[x for x in bpy.data.objects if x.type=='MESH'][0];bpy.context.view_layer.objects.active=o;o.select_set(True)
m=o.modifiers.new('d','DECIMATE');m.ratio=ratio if ratio<=1 else min(1,ratio/len(o.data.polygons));m.use_collapse_triangulate=True;bpy.ops.object.modifier_apply(modifier='d')
print('faces',len(o.data.polygons))
bpy.ops.export_scene.gltf(filepath=dst,export_format='GLB',use_selection=True,export_image_format='JPEG')
