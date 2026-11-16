"""Unstable Unicorns diorama (Andrew's Meshy model) -> game model. Two steps:
  /tmp/bvenv/bin/python blender/unicorns_prep.py      cuts the modelled balloons and strings (the game flies real ones) and
                                                      writes models/06-unicorns/unicorns_cut.glb (full detail, not in git)
  npx gltfpack -i models/06-unicorns/unicorns_cut.glb -o models/06-unicorns/unicorns_base.glb -si 0.06 -noq
                                                      simplifies to ~70k triangles keeping the original UVs and texture
Blender's own decimate (the first version) and a re-bake onto fresh UVs both smeared the painted colours (the rainbow bands
bled into each other); gltfpack locks the texture seams, so the paint stays where Meshy put it. The game scales it x7."""
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
bpy.ops.export_scene.gltf(filepath='models/06-unicorns/unicorns_cut.glb', export_format='GLB', use_selection=True, export_yup=True, export_image_format='JPEG', export_jpeg_quality=90)
