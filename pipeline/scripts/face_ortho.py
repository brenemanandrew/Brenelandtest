import bpy,math,sys
src,dst=sys.argv[-2],sys.argv[-1]
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=src)
for o in bpy.data.objects:
    if o.type=='ARMATURE':o.data.pose_position='REST'
sc=bpy.context.scene;sc.render.engine='BLENDER_WORKBENCH';sc.display.shading.light='FLAT';sc.display.shading.color_type='TEXTURE'
sc.view_settings.view_transform='Standard'
sc.render.resolution_x=800;sc.render.resolution_y=800;sc.world=bpy.data.worlds.new('w')
cam=bpy.data.cameras.new('c');cam.type='ORTHO';cam.ortho_scale=0.4;co=bpy.data.objects.new('c',cam);sc.collection.objects.link(co);sc.camera=co
co.location=(0,-5,1.52);co.rotation_euler=(math.pi/2,0,0);sc.render.filepath=dst;bpy.ops.render.render(write_still=True)
