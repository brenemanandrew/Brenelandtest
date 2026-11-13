import bpy,numpy as np
bpy.ops.wm.open_mainfile(filepath='/home/claude/out/leia2_dec.blend')
o=bpy.data.objects['Leia2'];A=np.array([v.co[:] for v in o.data.vertices])
A=A[:,[0,2,1]]*np.array([1,1,-1])  # to glTF axes: x, y up, z forward
s=1.70/(A[:,1].max()-A[:,1].min());A=(A-[0,A[:,1].min(),0])*s
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath='/home/claude/in3/leia.glb')
m=[x for x in bpy.data.objects if x.type=='MESH'][0];dg=bpy.context.evaluated_depsgraph_get()
B=np.array([m.matrix_world@v.co for v in m.data.vertices]);B=B[:,[0,2,1]]*np.array([1,1,-1])
def rep(n,P):
    arm=P[(np.abs(P[:,0])>0.35)&(np.abs(P[:,0])<0.45)]
    print(n,'scale',round(s,4) if n=='new' else '','height',P[:,1].max().round(3),'span',P[:,0].min().round(3),P[:,0].max().round(3),'arm y',arm[:,1].mean().round(3),'arm thick',(arm[:,1].max()-arm[:,1].min()).round(3),'depth',P[:,2].min().round(3),P[:,2].max().round(3))
    for y in [0.9,1.0,1.1,1.2,1.3,1.45,1.55]:
        sl=P[np.abs(P[:,1]-y)<0.01];sl=sl[np.abs(sl[:,0])<0.3]
        print('   y',y,'w',(sl[:,0].max()-sl[:,0].min()).round(3),'d',(sl[:,2].max()-sl[:,2].min()).round(3),'cx',((sl[:,0].max()+sl[:,0].min())/2).round(3),'cz',((sl[:,2].max()+sl[:,2].min())/2).round(3))
rep('new',A);rep('old',B)
