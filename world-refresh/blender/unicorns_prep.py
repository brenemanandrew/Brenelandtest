"""Unstable Unicorns diorama (Andrew's Meshy model) -> game parts. /tmp/bvenv/bin/python blender/unicorns_prep.py
Cuts the modelled balloons and their strings off (the game flies real ones), decimates with UVs kept, exports
models/06-unicorns/unicorns_base.glb (1 unit = the model's own; the game scales it x8)."""
import bpy, bmesh, sys
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath='models/06-unicorns/unicorns_diorama_original.glb')
o = [x for x in bpy.context.scene.objects if x.type == 'MESH'][0]; bpy.context.view_layer.objects.active = o; o.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
bm = bmesh.new(); bm.from_mesh(o.data)
# Blender axes after import: x = model x, y = -model z (depth), z = model y (up). Rainbow slab: model z -0.43..-0.31 -> blender y 0.31..0.43
dead = [f for f in bm.faces if (lambda c: c.y < 0.322 and c.z > -0.36 and abs(c.x) < 0.8)(f.calc_center_median())]
bmesh.ops.delete(bm, geom=dead, context='FACES'); print('cut', len(dead), 'balloon/string faces')
bm.to_mesh(o.data); bm.free()
md = o.modifiers.new('d', 'DECIMATE'); md.ratio = float(sys.argv[-1]) if sys.argv[-1].replace('.', '').isdigit() else 0.06
bpy.ops.object.modifier_apply(modifier='d'); print('faces now', len(o.data.polygons))
for im in bpy.data.images:
    if im.size[0] > 2048: im.scale(2048, 2048)
bpy.ops.export_scene.gltf(filepath='models/06-unicorns/unicorns_base.glb', export_format='GLB', use_selection=True, export_yup=True, export_image_format='JPEG', export_jpeg_quality=85)
