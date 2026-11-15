"""Small scene kit for the concept builds (bpy 5.3, Cycles CPU). Units metres, z up."""
import bpy, math
_m = {}
def reset():
    _m.clear(); bpy.ops.wm.read_factory_settings(use_empty=True)
    s = bpy.context.scene; s.render.engine = 'CYCLES'; s.cycles.device = 'CPU'; s.cycles.samples = 48; s.cycles.use_denoising = True
    s.render.resolution_x, s.render.resolution_y = 1280, 800; s.view_settings.view_transform = 'Standard'
    try: s.view_settings.look = 'None'
    except Exception: pass
    return s
def mat(col, emit=0.0, rough=0.9, alpha=1.0):
    key = (tuple(col), emit, rough, alpha)
    if key in _m: return _m[key]
    m = bpy.data.materials.new('m'); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    c = tuple(col) + (1,) if len(col) == 3 else tuple(col)
    b.inputs['Base Color'].default_value = c; b.inputs['Roughness'].default_value = rough
    if emit: b.inputs['Emission Color'].default_value = c; b.inputs['Emission Strength'].default_value = emit
    if alpha < 1: b.inputs['Alpha'].default_value = alpha; b.inputs['Transmission Weight'].default_value = 0.0
    _m[key] = m; return m
def hexc(h): h = h.lstrip('#'); return tuple((int(h[i:i + 2], 16) / 255) ** 2.2 for i in (0, 2, 4))
def _fin(o, col, emit=0, bevel=0.0, rough=0.9, alpha=1.0):
    if bevel: md = o.modifiers.new('b', 'BEVEL'); md.width = bevel; md.segments = 3
    o.data.materials.append(mat(hexc(col) if isinstance(col, str) else col, emit, rough, alpha)); return o
def box(x, y, z, w, d, h, col, emit=0, bevel=0.02, rot=0, **k):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, z + h / 2), rotation=(0, 0, rot)); o = bpy.context.active_object; o.scale = (w, d, h)
    bpy.ops.object.transform_apply(scale=True); return _fin(o, col, emit, bevel, **k)
def cyl(x, y, z, r, h, col, emit=0, seg=32, r2=None, bevel=0.0, rot=(0, 0, 0), **k):
    bpy.ops.mesh.primitive_cone_add(vertices=seg, radius1=r, radius2=r if r2 is None else r2, depth=h, location=(x, y, z + h / 2), rotation=rot); o = bpy.context.active_object
    bpy.ops.object.shade_smooth(); return _fin(o, col, emit, bevel, **k)
def ball(x, y, z, r, col, emit=0, sx=1, sy=1, sz=1, **k):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=(x, y, z), segments=32, ring_count=16); o = bpy.context.active_object; o.scale = (sx, sy, sz)
    bpy.ops.object.shade_smooth(); return _fin(o, col, emit, **k)
def torus(x, y, z, R, r, col, emit=0, rot=(0, 0, 0), **k):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, location=(x, y, z), rotation=rot); o = bpy.context.active_object; bpy.ops.object.shade_smooth(); return _fin(o, col, emit, **k)
def text(s, x, y, z, size, col, emit=0, rot=(math.pi / 2, 0, 0), ext=0.03):
    bpy.ops.object.text_add(location=(x, y, z), rotation=rot); o = bpy.context.active_object; o.data.body = s; o.data.size = size; o.data.extrude = ext; o.data.align_x = 'CENTER'
    o.data.materials.append(mat(hexc(col), emit)); return o
def sun(strength=3.0, rot=(0.9, 0, 0.6), col=(1, 0.96, 0.9)):
    bpy.ops.object.light_add(type='SUN', rotation=rot); l = bpy.context.active_object; l.data.energy = strength; l.data.color = col; l.data.angle = 0.05; return l
def lamp(x, y, z, w, col=(1, 0.85, 0.6), size=0.3):
    bpy.ops.object.light_add(type='POINT', location=(x, y, z)); l = bpy.context.active_object; l.data.energy = w; l.data.color = col; l.data.shadow_soft_size = size; return l
def sky(top, strength=1.0):
    w = bpy.data.worlds.new('w'); bpy.context.scene.world = w; w.use_nodes = True; bg = w.node_tree.nodes['Background']; bg.inputs[0].default_value = hexc(top) + (1,); bg.inputs[1].default_value = strength
def cam(pos, look, lens=35):
    import mathutils
    bpy.ops.object.camera_add(location=pos); c = bpy.context.active_object; c.data.lens = lens
    d = mathutils.Vector(look) - mathutils.Vector(pos); c.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler(); bpy.context.scene.camera = c; return c
def render(path): bpy.context.scene.render.filepath = path; bpy.ops.render.render(write_still=True)
def person(x, y, z, top, bottom, skin='#e0b48f', hair='#5a3a24', s=1.0, rot=0, shoes='#3a2a20', skirt=False):
    """A simple Breneland-style figure (big round head)."""
    box(x - 0.09 * s, y, z, 0.11 * s, 0.12 * s, 0.5 * s, skin if skirt else bottom, bevel=0.03); box(x + 0.09 * s, y, z, 0.11 * s, 0.12 * s, 0.5 * s, skin if skirt else bottom, bevel=0.03)
    box(x - 0.09 * s, y - 0.03 * s, z, 0.13 * s, 0.22 * s, 0.08 * s, shoes, bevel=0.03); box(x + 0.09 * s, y - 0.03 * s, z, 0.13 * s, 0.22 * s, 0.08 * s, shoes, bevel=0.03)
    if skirt: cyl(x, y, z + 0.38 * s, 0.24 * s, 0.22 * s, bottom, r2=0.17 * s)
    cyl(x, y, z + 0.5 * s, 0.19 * s, 0.45 * s, top, r2=0.16 * s, bevel=0.0)
    for sg in (-1, 1): cyl(x + sg * 0.23 * s, y, z + 0.55 * s, 0.05 * s, 0.38 * s, top); ball(x + sg * 0.23 * s, y, z + 0.52 * s, 0.055 * s, skin)
    ball(x, y, z + 1.2 * s, 0.27 * s, skin); ball(x, y + 0.02 * s, z + 1.27 * s, 0.275 * s, hair, sz=0.85)
