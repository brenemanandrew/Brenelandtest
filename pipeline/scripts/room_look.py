import bpy,math,sys
from mathutils import Vector
src,dst=sys.argv[-2],sys.argv[-1]
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=src)
sc=bpy.context.scene;sc.render.engine='BLENDER_WORKBENCH';sc.display.shading.light='FLAT';sc.display.shading.color_type='TEXTURE';sc.view_settings.view_transform='Standard'
sc.render.resolution_x=500;sc.render.resolution_y=500;sc.world=bpy.data.worlds.new('w')
obs=[o for o in bpy.data.objects if o.type=='MESH']
import numpy as np
allc=np.array([o.matrix_world@Vector(c) for o in obs for c in o.bound_box]);mn,mx=allc.min(0),allc.max(0);cen=(mn+mx)/2;size=(mx-mn).max()
print('bounds',mn,mx)
for o in obs:
    bb=np.array([o.matrix_world@Vector(c) for c in o.bound_box]);print(o.name,'min',bb.min(0).round(4),'max',bb.max(0).round(4),'faces',len(o.data.polygons))
cam=bpy.data.cameras.new('c');co=bpy.data.objects.new('c',cam);sc.collection.objects.link(co);sc.camera=co;cam.clip_start=0.0005;cam.lens=18
def shot(name,pos,look):
    co.location=pos;d=Vector(look)-Vector(pos);co.rotation_euler=d.to_track_quat('-Z','Y').to_euler();sc.render.filepath=dst+name+'.png';bpy.ops.render.render(write_still=True)
c=Vector(cen)
# outside views (blender z up)
for k,a in enumerate([0.6,2.2,3.8,5.4]):shot('out%d'%k,c+Vector((math.cos(a)*size*1.5,math.sin(a)*size*1.5,size*1.0)),c)
# inside views from the centre looking at each wall
for k,(dx,dy) in enumerate([(1,0),(-1,0),(0,1),(0,-1)]):shot('in%d'%k,c+Vector((-dx*size*0.05,-dy*size*0.05,0)),c+Vector((dx,dy,0)))
# each part alone
for o in obs:
    for p in obs:p.hide_render=p is not o
    bb=np.array([o.matrix_world@Vector(cc) for cc in o.bound_box]);pc=Vector((bb.min(0)+bb.max(0))/2);ps=(bb.max(0)-bb.min(0)).max()
    shot('part_'+o.name,pc+Vector((ps*1.2,-ps*1.4,ps*0.8)),pc)
