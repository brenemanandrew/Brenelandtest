import bpy, sys, math
bpy.ops.wm.open_mainfile(filepath=sys.argv[1]); outd=sys.argv[2]
sc=bpy.context.scene; sc.render.engine='BLENDER_WORKBENCH'
sc.display.shading.light='STUDIO'; sc.display.shading.color_type='TEXTURE'
sc.render.resolution_x=400; sc.render.resolution_y=500
cam=bpy.data.objects.new('cam',bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera=cam
cam.data.type='ORTHO'; cam.data.ortho_scale=2.1
ao=bpy.data.objects['Belinda']
views={'front':((0,-4,0.85),(math.pi/2,0,0)),'side':((4,0,0.85),(math.pi/2,0,math.pi/2)),'q':((2.8,-2.8,0.85),(math.pi/2,0,math.pi/4))}
jobs=[('rest',None,0,'front'),('rest',None,0,'side'),('rest',None,0,'q')]
for f in (0,6,12,18): jobs.append(('walk','walk',f,'side'))
for f in (0,6,12,18): jobs.append(('walkF','walk',f,'front'))
for f in (20,28,36): jobs.append(('wave','wave',f,'front'))
jobs.append(('waveQ','wave',30,'q'))
for f in (0,48): jobs.append(('idle','idle',f,'front'))
for i,(lab,act,f,v) in enumerate(jobs):
    ao.animation_data.action=bpy.data.actions[act] if act else None
    if not act:
        for pb in ao.pose.bones: pb.rotation_quaternion=(1,0,0,0); pb.location=(0,0,0)
    sc.frame_set(f)
    cam.location,cam.rotation_euler=views[v]
    sc.render.filepath=f'{outd}/s{i:02d}_{lab}_{f}_{v}.png'; bpy.ops.render.render(write_still=True)
