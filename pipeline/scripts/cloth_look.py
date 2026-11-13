import bpy,math,sys,glob,numpy as np
from mathutils import Vector
dst=sys.argv[-1]
fs=sorted(glob.glob('/home/claude/in20/*/*/Meshy_AI_model.glb'))
for f in fs:
    nm=f.split('/')[-2].replace('Meshy_AI_','').replace('Model_20261113','').replace('image-to-3d-texture','tex').replace('generate','gen')[:22]
    bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=f)
    sc=bpy.context.scene;sc.render.engine='BLENDER_WORKBENCH';sc.display.shading.light='STUDIO';sc.display.shading.color_type='TEXTURE';sc.view_settings.view_transform='Standard';sc.render.resolution_x=300;sc.render.resolution_y=300;sc.world=bpy.data.worlds.new('w')
    obs=[o for o in bpy.data.objects if o.type=='MESH'];bb=np.array([o.matrix_world@Vector(c) for o in obs for c in o.bound_box]);mn,mx=bb.min(0),bb.max(0);c=Vector((mn+mx)/2);s=(mx-mn).max()
    print(nm,'parts',len(obs),'faces',sum(len(o.data.polygons) for o in obs),'size',(mx-mn).round(3),'min',mn.round(3),'imgs',[tuple(i.size) for i in bpy.data.images][:3],'skin',any(o.find_armature() for o in obs))
    cam=bpy.data.cameras.new('c');cam.type='ORTHO';cam.ortho_scale=s*1.1;co=bpy.data.objects.new('c',cam);sc.collection.objects.link(co);sc.camera=co
    for k,(dx,dy) in enumerate([(0,-1),(0.75,-0.66),(0,1)]):
        co.location=c+Vector((dx,dy,0.15))*s*2;d=c-co.location;co.rotation_euler=d.to_track_quat('-Z','Y').to_euler();sc.render.filepath='%s%s-%d.png'%(dst,nm,k);bpy.ops.render.render(write_still=True)
