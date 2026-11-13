"""The Meshy dressing room -> a light prop for the creator: the shell (floor, walls, ceiling, bench) and the coat rack, in metres,
the door end toward -Z and the mirror end (cut away: the camera looks in from there) toward +Z, one small texture."""
import bpy,sys,math,bmesh
src,dst=sys.argv[-2],sys.argv[-1];S=2.62/0.0956
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=src)
obs={o.name:o for o in bpy.data.objects if o.type=='MESH'}
for n,o in list(obs.items()):
    if n not in('model_part5','model_part2'):bpy.data.objects.remove(o,do_unlink=True)
shell=bpy.data.objects['model_part5'];rack=bpy.data.objects['model_part2']
# cut the mirror end wall off the shell (world y > 0.052)
bm=bmesh.new();bm.from_mesh(shell.data);mw=shell.matrix_world
kill=[f for f in bm.faces if all((mw@v.co).y>0.0525 for v in f.verts)];bmesh.ops.delete(bm,geom=kill,context='FACES');print('cut faces',len(kill),'left',len(bm.faces));bm.to_mesh(shell.data);bm.free()
bpy.ops.object.select_all(action='DESELECT')
for o,target in((shell,26000),(rack,1500)):
    bpy.context.view_layer.objects.active=o;o.select_set(True);m=o.modifiers.new('d','DECIMATE');m.ratio=min(1,target/max(1,len(o.data.polygons)));bpy.ops.object.modifier_apply(modifier='d');o.select_set(False);print(o.name,len(o.data.polygons))
shell.select_set(True);rack.select_set(True);bpy.context.view_layer.objects.active=shell;bpy.ops.object.join()
shell.rotation_euler=(0,0,math.pi);shell.scale=(S,S,S);bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
import numpy as np
co=np.array([v.co[:] for v in shell.data.vertices]);print('bounds',co.min(0).round(3),co.max(0).round(3))
for img in bpy.data.images:
    if img.size[0]>1024:img.scale(1024,1024)
bpy.ops.export_scene.gltf(filepath=dst,export_format='GLB',export_image_format='JPEG',export_jpeg_quality=82,export_normals=False,export_materials='EXPORT',export_yup=True)
