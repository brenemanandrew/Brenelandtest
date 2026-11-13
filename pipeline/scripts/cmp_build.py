import bpy,math,sys
from mathutils import Vector
dst=sys.argv[-1]
bpy.ops.wm.read_factory_settings(use_empty=True)
sc=bpy.context.scene;sc.render.engine='BLENDER_WORKBENCH';sc.display.shading.light='STUDIO';sc.display.shading.color_type='MATERIAL';sc.view_settings.view_transform='Standard'
sc.render.resolution_x=420;sc.render.resolution_y=640;sc.world=bpy.data.worlds.new('w')
cam=bpy.data.cameras.new('c');cam.type='ORTHO';co=bpy.data.objects.new('c',cam);sc.collection.objects.link(co);sc.camera=co
def clear():
    for o in list(bpy.data.objects):
        if o is not co:bpy.data.objects.remove(o,do_unlink=True)
def shot(name,h,side=False):
    cam.ortho_scale=h*1.08;co.location=(5,0,h/2) if side else (0,-5,h/2);co.rotation_euler=(math.pi/2,0,math.pi/2 if side else 0);sc.render.filepath=dst+name+'.png';bpy.ops.render.render(write_still=True)
for nm in ['slim','heavy','athletic']:
    clear();bpy.ops.import_scene.gltf(filepath='/home/claude/out/mv_%s.glb'%nm)
    obs=[o for o in bpy.data.objects if o.type=='MESH'];zs=[(o.matrix_world@Vector(c)).z for o in obs for c in o.bound_box];h=max(zs)-min(zs)
    for o in obs:o.location.z-=min(zs)
    shot('src-'+nm,h);shot('src-'+nm+'-S',h,True)
clear();bpy.ops.import_scene.gltf(filepath='/home/claude/out/male-build.glb')
for o in bpy.data.objects:
    if o.type=='ARMATURE':o.data.pose_position='REST'
ms=[o for o in bpy.data.objects if o.type=='MESH'];print([(o.name,bool(o.data.shape_keys)) for o in ms]);me=[o for o in ms if o.data.shape_keys][0];
[setattr(o,'hide_render',True) for o in ms if o is not me];keys=me.data.shape_keys.key_blocks;print([k.name for k in keys])
for nm in ['base','slim','heavy','athletic']:
    for k in keys[1:]:k.value=0
    if nm!='base':
        for k in keys:
            if k.name==nm:k.value=1
    shot('mor-'+nm,1.7);shot('mor-'+nm+'-S',1.7,True)
