import bpy, sys, numpy as np, math
bpy.ops.wm.open_mainfile(filepath=sys.argv[1])
o=bpy.data.objects['Belinda']; me=o.data
hair=np.load('/home/claude/out/hair.npy'); dress=np.load('/home/claude/out/dress.npy')
a=me.color_attributes.new('cls','FLOAT_COLOR','POINT')
for i in range(len(me.vertices)):
    a.data[i].color=(0.1,0.1,0.9,1) if hair[i] else ((0.1,0.7,0.2,1) if dress[i] else (0.9,0.7,0.6,1))
me.color_attributes.active_color=a
sc=bpy.context.scene; sc.render.engine='BLENDER_WORKBENCH'; sc.display.shading.color_type='VERTEX'
sc.render.resolution_x=600; sc.render.resolution_y=600
cam=bpy.data.objects.new('cam',bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera=cam
cam.data.type='ORTHO'; cam.data.ortho_scale=2.0
for name,loc,rot in [('front',(0,-4,0.93),(math.pi/2,0,0)),('back',(0,4,0.93),(math.pi/2,0,math.pi)),('side',(4,0,0.93),(math.pi/2,0,math.pi/2))]:
    cam.location=loc; cam.rotation_euler=rot; sc.render.filepath=f'/home/claude/out/cls_{name}.png'; bpy.ops.render.render(write_still=True)
