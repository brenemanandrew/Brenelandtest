import bpy,sys
src,dst,ratio=sys.argv[-3],sys.argv[-2],float(sys.argv[-1])
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=src)
o=[x for x in bpy.data.objects if x.type=='MESH'][0];bpy.context.view_layer.objects.active=o;o.select_set(True)
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.remove_doubles(threshold=1e-5);bpy.ops.object.mode_set(mode='OBJECT')
m=o.modifiers.new('d','DECIMATE');m.ratio=ratio;bpy.ops.object.modifier_apply(modifier='d')
print('faces',len(o.data.polygons))
bpy.ops.export_scene.gltf(filepath=dst,export_format='GLB',use_selection=True,export_materials='NONE',export_texcoords=False)
