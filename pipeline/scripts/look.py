import bpy, sys, math, mathutils
glb, outp = sys.argv[1], sys.argv[2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
objs=[o for o in bpy.context.scene.objects if o.type=='MESH']
sc=bpy.context.scene
sc.render.engine='BLENDER_EEVEE'
sc.render.resolution_x=600; sc.render.resolution_y=800
w=bpy.data.worlds.new('w'); sc.world=w; w.use_nodes=True
w.node_tree.nodes['Background'].inputs[1].default_value=1.0
w.node_tree.nodes['Background'].inputs[0].default_value=(0.8,0.85,0.9,1)
cam=bpy.data.objects.new('cam',bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera=cam
cam.data.type='ORTHO'; cam.data.ortho_scale=2.2
L=bpy.data.objects.new('sun',bpy.data.lights.new('sun','SUN')); sc.collection.objects.link(L); L.rotation_euler=(0.6,0.2,0.5); L.data.energy=3
for name,ang in [('front',0),('side',90),('back',180)]:
    a=math.radians(ang)
    cam.location=(4*math.sin(a),-4*math.cos(a),0)
    cam.rotation_euler=(math.pi/2,0,a)
    sc.render.filepath=f"{outp}_{name}.png"
    bpy.ops.render.render(write_still=True)
for o in objs: print(o.name, o.dimensions, o.location, o.rotation_euler)
