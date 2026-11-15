"""The yard's picket fence, modelled in Blender (bpy 5.3): /tmp/bvenv/bin/python blender/build_fence.py
Parts in metres, origin at the foot centre, +y up, the fence's run along x:
  fence_picket_0..2.glb  a picket board 0.30 x 1.10 x 0.045, bevelled, pointed top; three slightly different (height, tip, lean)
  fence_post.glb         a 0.16 post, 1.30 tall, bevelled, with a stepped cap and a ball finial
  fence_rail.glb         a 1 m bevelled rail 0.085 x 0.05 (the game stretches it to each span)
Vertex colours: white paint with a faint warm wash, the bevels and the foot a touch darker (painted AO)."""
import bpy, bmesh, math, random, os
OUT = 'models/blender'; os.makedirs(OUT, exist_ok=True)
def reset(): bpy.ops.wm.read_factory_settings(use_empty=True)
def finish(obj, name, base=(0.985, 0.975, 0.95), foot=0.8):
    m = obj.data; m.update()
    col = m.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    zs = [v.co.z for v in m.vertices]; z0, z1 = min(zs), max(zs)
    for poly in m.polygons:
        n = poly.normal; edge = 1 - abs(n.y) * 0.04 - (0.05 if abs(n.z) > 0.5 and n.z < 0 else 0)
        for li in poly.loop_indices:
            v = m.vertices[m.loops[li].vertex_index].co; t = (v.z - z0) / max(1e-6, z1 - z0)
            k = (foot + (1 - foot) * min(1, t * 3)) * edge * (0.985 + 0.015 * math.sin(v.x * 37 + v.z * 11))
            col.data[li].color = (base[0] * k, base[1] * k, base[2] * k, 1)
    bpy.ops.object.select_all(action='DESELECT'); obj.select_set(True); bpy.context.view_layer.objects.active = obj
    bpy.ops.export_scene.gltf(filepath=f'{OUT}/{name}.glb', export_format='GLB', use_selection=True, export_yup=True, export_apply=True)
def box(w, h, d, bevel=0.012, segs=2):
    bpy.ops.mesh.primitive_cube_add(size=1); o = bpy.context.active_object; o.scale = (w, d, h); bpy.ops.object.transform_apply(scale=True)
    o.location.z = h / 2; bpy.ops.object.transform_apply(location=True)
    mod = o.modifiers.new('bev', 'BEVEL'); mod.width = bevel; mod.segments = segs; mod.limit_method = 'ANGLE'
    bpy.ops.object.modifier_apply(modifier='bev'); return o
def join(objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]; bpy.ops.object.join(); return objs[0]
random.seed(7)
for i in range(3):
    reset(); h = 1.06 + 0.04 * i; w = 0.30
    board = box(w, h, 0.045, 0.012)
    # pointed top: a prism over the board, bevelled
    bm = bmesh.new(); tip = 0.15 + 0.02 * (i - 1)
    vs = [bm.verts.new(p) for p in [(-w / 2, -0.0225, h), (w / 2, -0.0225, h), (0, -0.0225, h + tip), (-w / 2, 0.0225, h), (w / 2, 0.0225, h), (0, 0.0225, h + tip)]]
    for f in [(0, 1, 2), (5, 4, 3), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)]: bm.faces.new([vs[j] for j in f])
    me = bpy.data.meshes.new('tip'); bm.to_mesh(me); tipo = bpy.data.objects.new('tip', me); bpy.context.scene.collection.objects.link(tipo)
    mod = tipo.modifiers.new('bev', 'BEVEL'); mod.width = 0.008; mod.segments = 2
    bpy.context.view_layer.objects.active = tipo; bpy.ops.object.modifier_apply(modifier='bev')
    o = join([board, tipo]); o.rotation_euler = (0, math.radians((i - 1) * 0.8), 0); bpy.ops.object.transform_apply(rotation=True)
    finish(o, f'fence_picket_{i}')
reset()
post = box(0.16, 1.30, 0.16, 0.018, 3)
cap1 = box(0.23, 0.05, 0.23, 0.012); cap1.location.z = 1.30; bpy.ops.object.transform_apply(location=True)
cap2 = box(0.18, 0.04, 0.18, 0.01); cap2.location.z = 1.35; bpy.ops.object.transform_apply(location=True)
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.065, segments=12, ring_count=8, location=(0, 0, 1.45)); ball = bpy.context.active_object
finish(join([post, cap1, cap2, ball]), 'fence_post')
reset()
rail = box(1.0, 0.085, 0.05, 0.012); rail.location.z = -0.0425; bpy.ops.object.transform_apply(location=True)
finish(rail, 'fence_rail', foot=1.0)
print('fence parts written to', OUT)
