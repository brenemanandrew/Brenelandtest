import bpy,math,sys
from mathutils import Vector
src,dst=sys.argv[-2],sys.argv[-1]
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=src)
sc=bpy.context.scene;sc.render.engine='BLENDER_WORKBENCH';sc.display.shading.light='FLAT';sc.display.shading.color_type='TEXTURE';sc.view_settings.view_transform='Standard';sc.display.shading.show_backface_culling=True
sc.render.resolution_x=600;sc.render.resolution_y=600;sc.world=bpy.data.worlds.new('w')
cam=bpy.data.cameras.new('c');co=bpy.data.objects.new('c',cam);sc.collection.objects.link(co);sc.camera=co;cam.clip_start=0.01;cam.lens=20
def shot(name,pos,look):
    co.location=pos;d=Vector(look)-Vector(pos);co.rotation_euler=d.to_track_quat('-Z','Y').to_euler();sc.render.filepath=dst+name+'.png';bpy.ops.render.render(write_still=True)
# gltf (x,y,z) -> blender (x,-z,y)
g=lambda x,y,z:(x,-z,y)
shot('A',g(0,1.35,1.5),g(0,1.2,-1.07))     # from the mirror end toward the door end
shot('B',g(0,1.35,-0.9),g(0,1.2,1.6))      # from the door end toward the mirror end
shot('C',g(0,6,0.2),g(0,0,0.2001))         # from above
shot('D',g(0,1.35,4.5),g(0,1.0,0))         # the body view
