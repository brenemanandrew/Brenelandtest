"""The pizza place's waitresses, take 2: a real organic figure instead of stacked blocks.
Body = a skin-modifier skeleton (radii per joint) smoothed by subdivision, so the limbs, waist, hips and shoulders flow into each
other. Head = a sphere reshaped into a skull, cheeks and a soft chin, with ears, a small nose, eyes (white, iris, highlight, lash
line), brows, lips, blush. Clothes are their own skin meshes a little outside the body (shirt with sleeves, collar, placket,
buttons), a lathed skirt with soft folds, shoes. Hair: a cap with a side-swept fringe and a ponytail (evening) or a bun (day).
Run: /tmp/bvenv/bin/python blender/waitress_figure.py  -> concepts/waitress_figures_v2.png"""
import sys, math; sys.path.insert(0, 'blender'); from kit import *; from kit import _fin
import bpy, bmesh, mathutils
V = mathutils.Vector

def skin_mesh(name, nodes, edges, col, sub=2, root=0, rough=0.8):
    """nodes: [(x, y, z, rx, ry)], edges: [(i, j)] -> a smooth tube body."""
    me = bpy.data.meshes.new(name); me.from_pydata([n[:3] for n in nodes], edges, []); me.update()
    o = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(o)
    sk = o.modifiers.new('skin', 'SKIN'); sk.use_smooth_shade = True
    for i, n in enumerate(nodes): o.data.skin_vertices[0].data[i].radius = (n[3], n[4])
    o.data.skin_vertices[0].data[root].use_root = True
    sd = o.modifiers.new('sub', 'SUBSURF'); sd.levels = sub; sd.render_levels = sub
    return _fin(o, col, rough=rough)

def pose(rx, holding):
    """The joints. rx = 1 right side. holding: the right arm holds a tray up."""
    J = {}
    J['pelvis'] = (0, 0, 0.93); J['waist'] = (0, 0.005, 1.06); J['chest'] = (0, -0.005, 1.22); J['upper'] = (0, 0.005, 1.36)
    J['neck0'] = (0, 0.01, 1.43); J['neck1'] = (0, 0.0, 1.6)
    for s, k in ((-1, 'l'), (1, 'r')):
        J['hip' + k] = (s * 0.085, 0, 0.88); J['knee' + k] = (s * 0.09, -0.01, 0.5); J['ankle' + k] = (s * 0.095, 0.01, 0.1)
        J['toe' + k] = (s * 0.1, -0.11, 0.035); J['sh' + k] = (s * 0.165, 0.01, 1.385)
        if holding and k == 'r':
            J['elb' + k] = (0.235, 0.03, 1.16); J['wri' + k] = (0.3, -0.17, 1.24); J['hand' + k] = (0.31, -0.25, 1.28); J['thumb' + k] = (0.27, -0.22, 1.29)
        else:
            J['elb' + k] = (s * 0.215, 0.03, 1.13); J['wri' + k] = (s * 0.245, 0.0, 0.89); J['hand' + k] = (s * 0.255, -0.01, 0.8); J['thumb' + k] = (s * 0.235, -0.04, 0.85)
    return J

def body(J, skin, x0, rot):
    order = list(J.keys())
    R = {'pelvis': (0.15, 0.11), 'waist': (0.115, 0.085), 'chest': (0.14, 0.1), 'upper': (0.135, 0.085), 'neck0': (0.056, 0.054), 'neck1': (0.05, 0.05)}
    for k in 'lr':
        R.update({'hip' + k: (0.09, 0.095), 'knee' + k: (0.054, 0.056), 'ankle' + k: (0.032, 0.034), 'toe' + k: (0.035, 0.025), 'sh' + k: (0.056, 0.056),
                  'elb' + k: (0.04, 0.04), 'wri' + k: (0.028, 0.024), 'hand' + k: (0.034, 0.016), 'thumb' + k: (0.012, 0.012)})
    E = [('pelvis', 'waist'), ('waist', 'chest'), ('chest', 'upper'), ('upper', 'neck0'), ('neck0', 'neck1')]
    for k in 'lr':
        E += [('pelvis', 'hip' + k), ('hip' + k, 'knee' + k), ('knee' + k, 'ankle' + k), ('ankle' + k, 'toe' + k), ('upper', 'sh' + k),
              ('sh' + k, 'elb' + k), ('elb' + k, 'wri' + k), ('wri' + k, 'hand' + k), ('wri' + k, 'thumb' + k)]
    nodes = [J[k] + R[k] for k in order]
    o = skin_mesh('body', nodes, [(order.index(a), order.index(b)) for a, b in E], skin)
    bpy.ops.object.select_all(action='DESELECT'); bpy.context.view_layer.objects.active = o; o.select_set(True); bpy.ops.object.convert(target='MESH')
    for v in o.data.vertices:   # a soft bust sculpted into the chest
        if v.co.y < 0:
            for sg in (-1, 1):
                dx, dz = v.co.x - sg * 0.062, (v.co.z - 1.232) / 1.15
                v.co.y -= 0.034 * math.exp(-(dx * dx + dz * dz) / (2 * 0.036 ** 2))
    # each vertex's nearest bone (the clothes are cut from the body by these)
    seg = []
    for v in o.data.vertices:
        best = (9, None, 0)
        for a, b in E:
            A, B = V(J[a]), V(J[b]); d = B - A; t = max(0, min(1, (v.co - A).dot(d) / d.length_squared))
            r = (sum(R[a]) / 2) * (1 - t) + (sum(R[b]) / 2) * t; dist = (v.co - (A + d * t)).length / r   # (relative to the limb's girth)
            if dist < best[0]: best = (dist, (a, b), t)
        seg.append(best[1:])
    o.data.update(); return o, seg

def garment(o, seg, keep, cuts, off, col, thick=0.006, name='cloth'):
    """a copy of the body's surface where keep(bone, t) is true, cut clean by planes [(point, normal, bones or None)] (the side the
    normal points to goes), pushed `off` out along the normals and given a little thickness"""
    bm = bmesh.new(); bm.from_mesh(o.data); bm.verts.ensure_lookup_table()
    lab = {v: seg[v.index] for v in bm.verts}
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not keep(*lab[v])], context='VERTS')
    for co, no, bones in cuts:
        faces = [f for f in bm.faces if bones is None or all(lab.get(v, (None,))[0] in bones for v in f.verts)]
        if not faces: continue
        edges = list({e for f in faces for e in f.edges}); verts = list({v for f in faces for v in f.verts})
        bmesh.ops.bisect_plane(bm, geom=faces + edges + verts, dist=1e-5, plane_co=co, plane_no=no, clear_outer=True)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.normal_update()
    for v in bm.verts: v.co += v.normal * off
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); g = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(g)
    for p in me.polygons: p.use_smooth = True
    so = g.modifiers.new('s', 'SOLIDIFY'); so.thickness = thick; so.offset = 1.0
    return _fin(g, col, rough=0.85)

def place(o, x0, rot):
    """move a part built around x=0 to the figure's spot and turn it with her"""
    p = o.location.copy(); c, s = math.cos(rot), math.sin(rot)
    o.location = (x0 + p.x * c - p.y * s, p.x * s + p.y * c, p.z); o.rotation_euler.z += rot; return o

def head(x0, rot, skin, eye, lips, hair, style):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.115, segments=48, ring_count=32, location=(0, 0, 0)); h = bpy.context.active_object
    for v in h.data.vertices:   # skull -> head: taller, the jaw narrows to a soft chin, cheeks fuller, the back of the head rounder
        x, y, z = v.co; t = max(0.0, -z / 0.115)
        x *= 1.0 - 0.32 * t ** 1.6; y *= 1.0 - 0.18 * t ** 1.4
        if y < 0 and z < 0.02: y -= 0.012 * (1 - abs(x) / 0.115) * max(0, 1 - t)          # the face plane comes forward a touch
        if z < -0.05 and y < 0: y -= 0.01 * t                                           # chin
        z *= 1.12; v.co = (x, y, z)
    bpy.ops.object.shade_smooth(); _fin(h, skin); h.location = (0, 0.0, 1.645); place(h, x0, rot)
    Z = 1.645
    for s in (-1, 1):
        place(ball(s * 0.113, 0.01, Z - 0.005, 0.024, skin, sx=0.45, sz=1.25), x0, rot)                        # ears
        place(ball(s * 0.043, -0.098, Z + 0.006, 0.022, '#fbfaf6', sx=1.0, sy=0.45, sz=1.25, rough=0.3), x0, rot)  # eye white
        place(ball(s * 0.043, -0.106, Z + 0.004, 0.0155, eye, sy=0.4, sz=1.2, rough=0.2), x0, rot)               # iris
        place(ball(s * 0.043, -0.111, Z + 0.004, 0.008, '#120c08', sy=0.4, sz=1.2, rough=0.2), x0, rot)          # pupil
        place(ball(s * 0.037, -0.114, Z + 0.013, 0.004, '#ffffff', emit=1.5), x0, rot)                            # light
        lid = torus(0, 0, 0, 0.022, 0.0035, '#22160f', rot=(math.pi / 2, 0, 0)); lid.scale = (1.05, 1, 1.25)       # upper lash line
        bm = bmesh.new(); bm.from_mesh(lid.data); bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.y < 0.004], context='VERTS'); bm.to_mesh(lid.data); bm.free()
        lid.location = (s * 0.043, -0.104, Z + 0.006); lid.rotation_euler.y = -s * 0.12; place(lid, x0, rot)
        br = torus(0, 0, 0, 0.03, 0.0035, hair, rot=(math.pi / 2, 0, 0)); br.scale = (1.0, 1, 0.45)                 # brow
        bm = bmesh.new(); bm.from_mesh(br.data); bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.y < 0.012], context='VERTS'); bm.to_mesh(br.data); bm.free()
        br.location = (s * 0.045, -0.104, Z + 0.035); br.rotation_euler.y = -s * 0.18; place(br, x0, rot)
        place(ball(s * 0.06, -0.088, Z - 0.03, 0.02, '#f2a39a', sy=0.3, sz=0.7, alpha=1.0), x0, rot)                # blush
    place(ball(0, -0.118, Z - 0.022, 0.012, skin, sx=0.9, sy=0.8, sz=1.1), x0, rot)                                 # nose
    place(ball(0, -0.104, Z - 0.062, 0.014, lips, sx=1.3, sy=0.4, sz=0.38, rough=0.4), x0, rot)                     # upper lip
    place(ball(0, -0.103, Z - 0.072, 0.013, lips, sx=1.2, sy=0.42, sz=0.45, rough=0.4), x0, rot)                     # lower lip
    # hair: a cap over the skull (open over the face), a side-swept fringe, then the ponytail or the bun
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.125, segments=48, ring_count=32); c = bpy.context.active_object
    bm = bmesh.new(); bm.from_mesh(c.data)
    kill = [v for v in bm.verts if (v.co.y < -0.02 and v.co.z < 0.045 - 0.25 * max(0, abs(v.co.x) - 0.055)) or v.co.z < -0.075 or (v.co.z < -0.03 and v.co.y < 0.03 and abs(v.co.x) > 0.06)]
    bmesh.ops.delete(bm, geom=kill, context='VERTS'); bm.to_mesh(c.data); bm.free()
    c.scale = (1.02, 1.04, 1.1); s = c.modifiers.new('s', 'SOLIDIFY'); s.thickness = 0.012; sd = c.modifiers.new('d', 'SUBSURF'); sd.levels = 1
    bpy.ops.object.shade_smooth(); _fin(c, hair, rough=0.55); c.location = (0, 0.004, Z + 0.006); place(c, x0, rot)
    f = ball(-0.03, -0.085, Z + 0.075, 0.07, hair, sx=1.25, sy=0.5, sz=0.42, rough=0.55); f.rotation_euler = (0.25, 0.3, -0.35); place(f, x0, rot)   # fringe
    if style == 'pony':
        place(ball(0, 0.105, Z + 0.06, 0.03, hair, rough=0.55), x0, rot)
        tie = torus(0, 0.125, Z + 0.06, 0.022, 0.008, '#3f9a5a', rot=(math.pi / 2, 0, 0)); place(tie, x0, rot)
        pts = [(0, 0.14, Z + 0.06, 0.034), (0, 0.17, Z + 0.0, 0.04), (0, 0.175, Z - 0.07, 0.036), (0, 0.16, Z - 0.14, 0.026), (0.01, 0.14, Z - 0.2, 0.012)]
        pt = skin_mesh('pony', [p[:3] + (p[3], p[3] * 0.8) for p in pts], [(i, i + 1) for i in range(len(pts) - 1)], hair, rough=0.55); place(pt, x0, rot)
    else:
        place(ball(0, 0.07, Z + 0.12, 0.055, hair, sz=0.85, rough=0.55), x0, rot)
        place(torus(0, 0.07, Z + 0.12, 0.05, 0.009, '#c7392f', rot=(0.5, 0, 0)), x0, rot)

def shirt(o, seg, J, col, sleeve, hem=0.95, neck=1.448):
    TORSO = {('pelvis', 'waist'), ('waist', 'chest'), ('chest', 'upper'), ('upper', 'neck0'), ('neck0', 'neck1'), ('pelvis', 'hipl'), ('pelvis', 'hipr'), ('upper', 'shl'), ('upper', 'shr')}
    keep = lambda b, t: b in TORSO or (b[0].startswith('sh') and b[1].startswith('elb') and t < sleeve + 0.15)
    cuts = [((0, 0, hem), (0, 0, -1), None), ((0, 0, neck), (0, 0.25, 1), {('upper', 'neck0'), ('neck0', 'neck1'), ('chest', 'upper')})]
    for k in 'lr':
        A, B = V(J['sh' + k]), V(J['elb' + k]); cuts.append((tuple(A + (B - A) * sleeve), tuple((B - A).normalized()), {('sh' + k, 'elb' + k)}))
    return garment(o, seg, keep, cuts, 0.007, col, name='shirt')

def waist_size(o, z=0.99):
    xs = [abs(v.co.x) for v in o.data.vertices if abs(v.co.z - z) < 0.012 and abs(v.co.x) < 0.2]; ys = [abs(v.co.y) for v in o.data.vertices if abs(v.co.z - z) < 0.012 and abs(v.co.x) < 0.2]
    return max(xs), max(ys)

def skirt(col, x0, rot, top=1.0, hem=0.62, r0=0.135, r1=0.25, folds=10, ry=0.82):
    bm = bmesh.new(); rings = 14; seg = 64; vs = []
    for i in range(rings + 1):
        t = i / rings; z = top + (hem - top) * t; r = r0 + (r1 - r0) * (t ** 0.85); row = []
        for j in range(seg):
            a = j / seg * math.tau; rr = r * (1 + 0.06 * t * math.sin(a * folds)); row.append(bm.verts.new((rr * math.cos(a), rr * math.sin(a) * ry, z)))
        vs.append(row)
    for i in range(rings):
        for j in range(seg): bm.faces.new((vs[i][j], vs[i][(j + 1) % seg], vs[i + 1][(j + 1) % seg], vs[i + 1][j]))
    me = bpy.data.meshes.new('skirt'); bm.to_mesh(me); bm.free(); o = bpy.data.objects.new('skirt', me); bpy.context.collection.objects.link(o)
    s = o.modifiers.new('s', 'SOLIDIFY'); s.thickness = 0.008; d = o.modifiers.new('d', 'SUBSURF'); d.levels = 1
    for p in o.data.polygons: p.use_smooth = True
    _fin(o, col, rough=0.75); o.location = (x0, 0, 0); o.rotation_euler = (0, 0, rot); return o

def stripes(a, b, n=26):
    """a material banded in z (the diner shirt)"""
    m = bpy.data.materials.new('stripes'); m.use_nodes = True; nt = m.node_tree; bs = nt.nodes['Principled BSDF']
    tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ'); mul = nt.nodes.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'; mul.inputs[1].default_value = n
    fr = nt.nodes.new('ShaderNodeMath'); fr.operation = 'FRACT'; gt = nt.nodes.new('ShaderNodeMath'); gt.operation = 'GREATER_THAN'; gt.inputs[1].default_value = 0.5
    mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.inputs[6].default_value = hexc(a) + (1,); mx.inputs[7].default_value = hexc(b) + (1,)
    nt.links.new(tc.outputs['Object'], sep.inputs[0]); nt.links.new(sep.outputs[2], mul.inputs[0]); nt.links.new(mul.outputs[0], fr.inputs[0]); nt.links.new(fr.outputs[0], gt.inputs[0])
    nt.links.new(gt.outputs[0], mx.inputs[0]); nt.links.new(mx.outputs[2], bs.inputs['Base Color']); bs.inputs['Roughness'].default_value = 0.85; return m

def waitress(x0, rot, outfit):
    night = outfit == 'evening'
    SK, EYE, LIP = ('#e8bf9c', '#3b7a4a', '#c0625a') if night else ('#b98563', '#5a3a22', '#a24a44')
    HAIR = '#e2c98f' if night else '#2e1d14'
    J = pose(1, True)
    bo, seg = body(J, SK, x0, rot); wx, wy = waist_size(bo); bo.location = (x0, 0, 0); bo.rotation_euler = (0, 0, rot)
    head(x0, rot, SK, EYE, LIP, HAIR, 'pony' if night else 'bun')
    if night:
        sh = shirt(bo, seg, J, '#3f9a5a', 0.45); sh.location = (x0, 0, 0); sh.rotation_euler = (0, 0, rot)
        place(torus(0, 0.008, 1.452, 0.056, 0.011, '#4fae6a', rot=(0.18, 0, 0)), x0, rot)
        for s in (-1, 1):   # polo collar points and the placket with buttons
            k = ball(s * 0.035, -0.055, 1.43, 0.04, '#4fae6a', sx=0.9, sy=0.35, sz=0.5, rough=0.8); k.rotation_euler = (0.9, 0, s * 0.5); place(k, x0, rot)
        place(box(0, -0.118, 1.33, 0.026, 0.006, 0.1, '#358550', bevel=0.003), x0, rot)
        for i in range(2): place(ball(0, -0.122, 1.41 - i * 0.045, 0.006, '#f3ead8', sy=0.5, rough=0.3), x0, rot)
        place(box(-0.075, -0.112, 1.33, 0.05, 0.006, 0.022, '#ffffff', bevel=0.003), x0, rot)   # name badge
        skirt('#1d1d22', x0, rot, 0.99, 0.66, wx + 0.016, wx + 0.1, 12, (wy + 0.016) / (wx + 0.016))
        shoe = '#1d1d22'
    else:
        sh = shirt(bo, seg, J, '#ffffff', 0.35); sh.location = (x0, 0, 0); sh.rotation_euler = (0, 0, rot); sh.data.materials[0] = stripes('#c7392f', '#f3ead8')
        for s in (-1, 1):
            k = ball(s * 0.035, -0.055, 1.43, 0.04, '#f3ead8', sx=0.9, sy=0.35, sz=0.5, rough=0.8); k.rotation_euler = (0.9, 0, s * 0.5); place(k, x0, rot)
        skirt('#f3ead8', x0, rot, 0.99, 0.6, wx + 0.016, wx + 0.12, 8, (wy + 0.016) / (wx + 0.016))
        ap = skirt('#c7392f', x0, rot, 0.985, 0.72, wx + 0.024, wx + 0.125, 0, (wy + 0.03) / (wx + 0.024)); ap.scale = (1.06, 1.12, 1.0)   # a short red apron over the front
        bm = bmesh.new(); bm.from_mesh(ap.data); bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.y > -0.06], context='VERTS'); bm.to_mesh(ap.data); bm.free()
        place(box(-0.075, -0.112, 1.33, 0.05, 0.006, 0.022, '#ffffff', bevel=0.003), x0, rot)   # name badge
        shoe = '#ffffff'
    for s in (-1, 1):   # shoes: rounded, the evening pair with a small heel, the day pair sneakers with a red sole
        sp = ball(s * 0.098, -0.045, 0.045, 0.06, shoe, sx=0.75, sy=1.55, sz=0.62, rough=0.35 if night else 0.8); place(sp, x0, rot)
        if night: place(cyl(s * 0.098, 0.04, 0.0, 0.016, 0.06, shoe, r2=0.012), x0, rot)
        else: place(cyl(s * 0.098, -0.045, 0.0, 0.065, 0.018, '#c7392f'), x0, rot).scale = (0.75, 1.5, 1)
    # the tray on the raised hand: a pizza on a steel tray
    hx, hy, hz = J['handr']
    for o, in [(cyl(hx + 0.02, hy - 0.04, hz + 0.035, 0.2, 0.012, '#c9ced6', rough=0.25),), (cyl(hx + 0.02, hy - 0.04, hz + 0.047, 0.17, 0.014, '#e3a14a'),),
               (cyl(hx + 0.02, hy - 0.04, hz + 0.06, 0.15, 0.006, '#c7392f'),)]: place(o, x0, rot)
    for i in range(8): a = i * 0.8; place(ball(hx + 0.02 + 0.09 * math.cos(a), hy - 0.04 + 0.09 * math.sin(a), hz + 0.066, 0.02, '#f6e7a0', sz=0.35), x0, rot)

reset(); sky('#f3ead8', 0.9); sun(2.4, (0.85, 0, -0.45)); lamp(-2, -3, 3, 300, (1, 0.95, 0.9), 1.5)
box(0, 0, -0.1, 30, 30, 0.1, '#efe6d4', bevel=0)
s = bpy.context.scene; s.cycles.samples = 96; s.render.resolution_x, s.render.resolution_y = 1600, 900
for i, (o, r) in enumerate([('evening', -0.35), ('evening', math.pi - 0.3), ('day', -0.35), ('day', math.pi - 0.3)]): waitress(-1.35 + i * 0.9, r, o)
for xx, t in [(-0.9, 'EVENING'), (0.9, 'DAY')]: text(t, xx, -0.6, 0.01, 0.09, '#4a3526', rot=(0, 0, 0))
cam((0, -5.2, 1.25), (0, 0, 0.98), 50); render('concepts/waitress_figures_v2.png')
# a face close-up of each
for k in list(bpy.data.objects):
    if k.type == 'CAMERA': bpy.data.objects.remove(k)
s.render.resolution_x, s.render.resolution_y = 1400, 800
for nm, xx in (('evening', -1.35), ('day', 0.45)): cam((xx + 0.25, -1.0, 1.6), (xx, 0, 1.45), 50); render('concepts/waitress_figures_v2_close_' + nm + '.png')
