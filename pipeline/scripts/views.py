import bpy, sys, math
blend, outp = sys.argv[1], sys.argv[2]
views = sys.argv[3].split(',') if len(sys.argv)>3 else ['front','side']
bpy.ops.wm.open_mainfile(filepath=blend)
sc=bpy.context.scene
sc.render.engine='BLENDER_WORKBENCH'
sc.display.shading.light='STUDIO'; sc.display.shading.color_type='TEXTURE'
sc.render.resolution_x=1000; sc.render.resolution_y=1000
cam=bpy.data.objects.new('cam',bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera=cam
cam.data.type='ORTHO'; cam.data.ortho_scale=2.0
CZ=0.93
for name in views:
    if name=='front': cam.location=(0,-4,CZ); cam.rotation_euler=(math.pi/2,0,0)
    if name=='side': cam.location=(4,0,CZ); cam.rotation_euler=(math.pi/2,0,math.pi/2)
    if name=='back': cam.location=(0,4,CZ); cam.rotation_euler=(math.pi/2,0,math.pi)
    sc.render.filepath=f"{outp}_{name}.png"
    bpy.ops.render.render(write_still=True)
