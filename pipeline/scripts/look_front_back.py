import bpy, math, sys
src, out = sys.argv[-2], sys.argv[-1]
bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=src)
sc=bpy.context.scene;sc.render.engine='BLENDER_WORKBENCH';sc.display.shading.light='FLAT';sc.display.shading.color_type='TEXTURE'
sc.render.resolution_x=300;sc.render.resolution_y=300;sc.world=bpy.data.worlds.new('w')
cam=bpy.data.cameras.new('c');cam.type='ORTHO';cam.ortho_scale=2.0;co=bpy.data.objects.new('c',cam);sc.collection.objects.link(co);sc.camera=co
for nm,loc,rot in [('F',(0,-5,0),(math.pi/2,0,0)),('B',(0,5,0),(math.pi/2,0,math.pi))]:
    co.location=loc;co.rotation_euler=rot;sc.render.filepath=f'{out}-{nm}.png';bpy.ops.render.render(write_still=True)
