import bpy, math, sys
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=sys.argv[-1])
sc=bpy.context.scene;sc.render.engine='BLENDER_WORKBENCH';sc.display.shading.light='FLAT';sc.display.shading.color_type='TEXTURE'
sc.render.resolution_x=500;sc.render.resolution_y=900;sc.world=bpy.data.worlds.new('w');
cam=bpy.data.cameras.new('c');cam.type='ORTHO';co=bpy.data.objects.new('c',cam);sc.collection.objects.link(co);sc.camera=co
for nm,loc,rot,sz in [('front',(0,-5,0),(math.pi/2,0,0),2.0),('side',(5,0,0),(math.pi/2,0,math.pi/2),2.0),('face',(0,-5,0.72),(math.pi/2,0,0),0.5)]:
    co.location=loc;co.rotation_euler=rot;cam.ortho_scale=sz
    sc.render.filepath=f'/home/claude/out/b5-{nm}.png';bpy.ops.render.render(write_still=True)
