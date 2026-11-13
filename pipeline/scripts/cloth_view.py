import bpy,math,sys
from mathutils import Vector
keys=sys.argv[sys.argv.index('--')+1:]
for key in keys:
    bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath='/home/claude/out/male-body-final.glb')
    for o in bpy.data.objects:
        if o.type=='ARMATURE':o.data.pose_position='REST'
    for o in [o for o in bpy.data.objects if o.type=='MESH' and not o.data.shape_keys]:o.hide_render=True
    bpy.ops.import_scene.gltf(filepath='/home/claude/out/clothfinal/%s.glb'%key)
    sc=bpy.context.scene;sc.render.engine='BLENDER_WORKBENCH';sc.display.shading.light='STUDIO';sc.display.shading.color_type='TEXTURE';sc.view_settings.view_transform='Standard';sc.render.resolution_x=380;sc.render.resolution_y=420;sc.world=bpy.data.worlds.new('w')
    cam=bpy.data.cameras.new('c');cam.type='ORTHO';cam.ortho_scale=1.05;co=bpy.data.objects.new('c',cam);sc.collection.objects.link(co);sc.camera=co;c=Vector((0,0,1.2))
    for k,(dx,dy) in enumerate([(0,-1),(0.8,-0.6),(1,0),(0,1)]):
        co.location=c+Vector((dx,dy,0.1))*3;d=c-co.location;co.rotation_euler=d.to_track_quat('-Z','Y').to_euler();sc.render.filepath='/home/claude/out/cv-%s-%d.png'%(key,k);bpy.ops.render.render(write_still=True)
