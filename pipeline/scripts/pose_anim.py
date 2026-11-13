import bpy, sys, math, numpy as np
from mathutils import Vector, Matrix, Quaternion
src, out_blend, out_glb = sys.argv[1], sys.argv[2], sys.argv[3]
TARGET_H = float(sys.argv[4]) if len(sys.argv)>4 else 1.65
bpy.ops.wm.open_mainfile(filepath=src)
o=bpy.data.objects['Belinda']; ao=bpy.data.objects['Belinda_rig']
vl=bpy.context.view_layer
def upd(): vl.update()
P=ao.pose.bones
for pb in P: pb.rotation_mode='QUATERNION'
def rot_world(pb, q, pivot=None):
    h=Vector(pivot) if pivot is not None else pb.head.copy()
    pb.matrix = Matrix.Translation(h) @ q.to_matrix().to_4x4() @ Matrix.Translation(-h) @ pb.matrix
    upd()
def aim(pb, d):
    d=Vector(d).normalized(); cur=(pb.tail-pb.head).normalized()
    rot_world(pb, cur.rotation_difference(d))
def twist(pb, deg):
    ax=(pb.tail-pb.head).normalized(); rot_world(pb, Quaternion(ax, math.radians(deg)))
def axis_q(axis, deg): return Quaternion(Vector(axis), math.radians(deg))
bpy.context.view_layer.objects.active=ao
bpy.ops.object.mode_set(mode='POSE')
# ---- 1. repose to a neutral stand (record each bone's local turn: its inverse is the original Meshy pose)
for n,d in [('upperarm_l',(0.25,0.03,-1)),('lowerarm_l',(0.10,-0.12,-1)),('hand_l',(0.08,-0.06,-1)),
            ('upperarm_r',(-0.25,0.03,-1)),('lowerarm_r',(-0.10,-0.12,-1)),('hand_r',(-0.08,-0.06,-1)),
            ('thigh_l',(0.05,0.0,-1)),('calf_l',(0.02,0.03,-1)),('foot_l',(0.10,-1,-0.55)),('ball_l',(0.10,-1,-0.05)),
            ('thigh_r',(-0.05,0.0,-1)),('calf_r',(-0.02,0.03,-1)),('foot_r',(-0.10,-1,-0.55)),('ball_r',(-0.10,-1,-0.05))]:
    aim(P[n], d)
HAND_TWIST=float(sys.argv[5]) if len(sys.argv)>5 else -90
twist(P['hand_l'], HAND_TWIST)
orig={pb.name: pb.rotation_quaternion.copy().inverted() for pb in P}
# apply as rest
bpy.ops.object.mode_set(mode='OBJECT')
for x in bpy.context.selected_objects: x.select_set(False)
vl.objects.active=o; o.select_set(True)
mod=[m for m in o.modifiers if m.type=='ARMATURE'][0]
bpy.ops.object.modifier_apply(modifier=mod.name)
vl.objects.active=ao; o.select_set(False); ao.select_set(True)
bpy.ops.object.mode_set(mode='POSE'); bpy.ops.pose.armature_apply(selected=False); bpy.ops.object.mode_set(mode='OBJECT')
m=o.modifiers.new('Armature','ARMATURE'); m.object=ao
# ---- 2. floor at 0, scale to height
co=np.array([v.co[:] for v in o.data.vertices]); z0=co[:,2].min(); h=co[:,2].max()-z0
s=TARGET_H/h
print('height before scale', round(h,3), 'scale', round(s,4))
for v in o.data.vertices: v.co=Vector(((v.co.x)*s,(v.co.y)*s,(v.co.z-z0)*s))
bpy.ops.object.mode_set(mode='EDIT')
for b in ao.data.edit_bones:
    b.head=Vector((b.head.x*s,b.head.y*s,(b.head.z-z0)*s)); b.tail=Vector((b.tail.x*s,b.tail.y*s,(b.tail.z-z0)*s))
bpy.ops.object.mode_set(mode='OBJECT')
ao.data.edit_bones if False else None
upd()
# ---- 3. clips (24 fps)
sc=bpy.context.scene; sc.render.fps=24
ao.animation_data_create()
ORDER=[b.name for b in ao.data.bones]  # parents before children
def reset():
    for pb in P: pb.rotation_quaternion=(1,0,0,0); pb.location=(0,0,0)
    upd()
def key(f):
    for pb in P:
        pb.keyframe_insert('rotation_quaternion', frame=f)
        if pb.name in ('pelvis','root'): pb.keyframe_insert('location', frame=f)
def move_pelvis(dx,dy,dz):
    pb=P['pelvis']; pb.matrix=Matrix.Translation((dx,dy,dz))@pb.matrix; upd()
def new_clip(name, n):
    act=bpy.data.actions.new(name); act.use_fake_user=True; ao.animation_data.action=act; return act
bpy.ops.object.mode_set(mode='POSE')
R=lambda n,ax,deg: rot_world(P[n], axis_q(ax,deg))
X,Y,Z=(1,0,0),(0,1,0),(0,0,1)
# idle: 4 s breathing and a slow weight shift
new_clip('idle',96)
for f in range(0,97,2):
    ph=2*math.pi*f/96; reset()
    move_pelvis(0.008*math.sin(ph),0,0)
    R('pelvis',Y,1.2*math.sin(ph))
    R('spine_02',X,-1.2*math.sin(2*ph)); R('spine_03',X,-1.0*math.sin(2*ph)); R('spine_02',Y,-1.0*math.sin(ph))
    R('neck_01',Z,2*math.sin(ph+0.6)); R('head',X,-1.5*math.sin(ph+1.2))
    for sd,sg in (('l',1),('r',-1)):
        R('upperarm_'+sd,X,2*math.sin(2*ph+0.5)); R('upperarm_'+sd,Y,-sg*1.5*math.sin(2*ph))
        R('lowerarm_'+sd,X,-6)
        R('thigh_'+sd,Y,-1.2*math.sin(ph)) 
    key(f)
# walk: 1 s, two steps, in place
new_clip('walk',24)
for f in range(0,25):
    ph=2*math.pi*f/24; s_=math.sin(ph); c_=math.cos(ph); reset()
    move_pelvis(0.010*s_, 0, 0.010*math.cos(2*ph)-0.012)
    R('pelvis',Z,4*s_); R('pelvis',Y,2.5*c_)
    R('spine_02',Z,-5*s_); R('spine_03',Z,-3*s_); R('head',Z,3*s_)
    for sd,sg,ph0 in (('l',1,0),('r',-1,math.pi)):
        sp=math.sin(ph+ph0); cp=math.cos(ph+ph0)
        bend=6+34*max(0.0,cp)**1.5
        R('thigh_'+sd,X,-18*sp-0.5*bend+3); R('calf_'+sd,X,bend); R('foot_'+sd,X,(18*sp+0.5*bend-bend)*0.8+8*max(0.0,-sp)*max(0.0,-cp))
        R('upperarm_'+sd,X,16*sp); R('lowerarm_'+sd,X,-12-14*max(0.0,-sp))
    key(f)
# wave: 3 s, her left arm up into the Meshy wave (her original pose), a wave, back down
new_clip('wave',72)
arm=['clavicle_l','upperarm_l','lowerarm_l','hand_l']
for f in range(0,73,2):
    reset()
    a = min(1,f/12) if f<60 else max(0,(72-f)/12); a=a*a*(3-2*a)
    for n in arm:
        P[n].rotation_quaternion=Quaternion((1,0,0,0)).slerp(orig[n],a)
    upd()
    w=a*14*math.sin(2*math.pi*max(0,f-10)/16)
    R('lowerarm_l',Y,w); R('hand_l',Y,0.6*w)
    R('spine_03',Z,4*a); R('head',Z,5*a); R('head',Y,-4*a)
    key(f)
ao.animation_data.action=None
reset()
bpy.ops.object.mode_set(mode='OBJECT')
# ---- 4. material: base colour + normal, no metal
mat=o.data.materials[0]; mat.name='Belinda'
nt=mat.node_tree; bs=[n for n in nt.nodes if n.type=='BSDF_PRINCIPLED'][0]
for l in list(bs.inputs['Metallic'].links)+list(bs.inputs['Roughness'].links): nt.links.remove(l)
bs.inputs['Metallic'].default_value=0.0; bs.inputs['Roughness'].default_value=0.8
for n in list(nt.nodes):
    if n.type=='TEX_IMAGE' and not n.outputs[0].links and not n.outputs[1].links: nt.nodes.remove(n)
for n in nt.nodes:
    if n.type=='TEX_IMAGE':
        used=[l.to_socket.name for l in n.outputs[0].links]
        print('tex',n.image.name,n.image.size[:],'->',used)
o.name='Belinda_mesh'; ao.name='Belinda'
bpy.ops.wm.save_as_mainfile(filepath=out_blend)
for x in bpy.context.selected_objects: x.select_set(False)
bpy.ops.export_scene.gltf(filepath=out_glb, export_format='GLB', export_animations=True, export_animation_mode='ACTIONS',
    export_force_sampling=True, export_frame_step=1, export_skins=True, export_all_influences=False,
    export_image_format='JPEG', export_jpeg_quality=85, export_yup=True, export_def_bones=False, export_apply=False)
print('exported')
