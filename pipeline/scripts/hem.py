import bpy, sys, math, numpy as np
bpy.ops.wm.open_mainfile(filepath=sys.argv[1])
sc=bpy.context.scene; sc.render.engine='BLENDER_WORKBENCH'; sc.display.shading.light='STUDIO'
sc.display.shading.color_type=sys.argv[3]
sc.render.resolution_x=700; sc.render.resolution_y=500
o=[x for x in bpy.data.objects if x.type=='MESH'][0]
if sys.argv[3]=='VERTEX':
    dress=np.load('/home/claude/out/dress.npy'); me=o.data
    a=me.color_attributes.new('cls','FLOAT_COLOR','POINT')
    for i in range(len(me.vertices)): a.data[i].color=(0.1,0.7,0.2,1) if dress[i] else (0.9,0.7,0.6,1)
    me.color_attributes.active_color=a
cam=bpy.data.objects.new('cam',bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera=cam
cam.data.lens=50
cam.location=(0.6,-1.6,0.25); 
import mathutils
d=mathutils.Vector((0,0,0.62))-cam.location; cam.rotation_euler=d.to_track_quat('-Z','Y').to_euler()
sc.render.filepath=sys.argv[2]; bpy.ops.render.render(write_still=True)
