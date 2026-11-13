import bpy, math
from mathutils import Vector
bpy.ops.wm.open_mainfile(filepath='/home/claude/out/leia2_dec.blend')
sc=bpy.context.scene;sc.render.engine='BLENDER_WORKBENCH';sc.display.shading.light='STUDIO';sc.display.shading.color_type='SINGLE'
sc.render.resolution_x=600;sc.render.resolution_y=900
cam=bpy.data.cameras.new('c');cam.type='ORTHO';cam.ortho_scale=2.1;co=bpy.data.objects.new('c',cam);sc.collection.objects.link(co);sc.camera=co
for nm,loc,rot in [('front',(0,-5,0),(math.pi/2,0,0)),('side',(5,0,0),(math.pi/2,0,math.pi/2)),('face',(0,-5,0.78),(math.pi/2,0,0))]:
    co.location=loc;co.rotation_euler=rot;cam.ortho_scale=0.45 if nm=='face' else 2.1
    sc.render.filepath=f'/home/claude/out/l2-{nm}.png';bpy.ops.render.render(write_still=True)
