"""Headless Blender jobs for the hub worker.
Run: blender -b --python blender_ops.py -- '{"mode": "process", "op": "decimate", "in": "a.glb", "out": "b.glb", "ratio": 0.3}'
Prints one line "HUB_RESULT <json>" at the end. Only the ops below exist; anything else is refused.

process ops: info, decimate, convert (fbx/obj/glb in, glb out)
breneland and retarget: pass "script" naming one of the pipeline scripts in ALLOWED; it is run with "args".
"""
import bpy, json, sys, os, runpy

ALLOWED = {  # Breneland pipeline scripts the hub may run (pipeline/scripts in the Brenelandtest repo)
    'fit_wear', 'shell_wear', 'skirt_wear', 'snug_hair', 'conform_hair', 'fit_hair', 'fit_beard', 'retarget_mixamo', 'decimate_glb', 'expose', 'hair_gap',
}

def load(p):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    ext = os.path.splitext(p)[1].lower()
    if ext in ('.glb', '.gltf', '.vrm'): bpy.ops.import_scene.gltf(filepath=p)
    elif ext == '.fbx': bpy.ops.import_scene.fbx(filepath=p)
    elif ext == '.obj': bpy.ops.wm.obj_import(filepath=p)
    else: raise SystemExit(f'cannot read {ext}')

def meshes(): return [o for o in bpy.context.scene.objects if o.type == 'MESH']
def tris(): return sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes())

def main(a):
    mode, op = a.get('mode'), a.get('op', 'info')
    if mode in ('breneland', 'retarget'):
        name = a.get('script', 'retarget_mixamo' if mode == 'retarget' else 'fit_wear')
        if name not in ALLOWED: return {'error': f'{name} is not on the allowed list'}
        here = os.path.dirname(os.path.abspath(__file__))
        script = os.path.join(a.get('pipeline', os.path.join(here, '..', '..', 'pipeline', 'scripts')), name + '.py')
        sys.argv = [script] + [str(x) for x in a.get('args', [])]
        runpy.run_path(script, run_name='__main__')
        return {'ran': name, 'args': a.get('args', [])}
    load(a['in'])
    before = tris()
    if op == 'info':
        return {'objects': len(meshes()), 'tris': before, 'armature': any(o.type == 'ARMATURE' for o in bpy.context.scene.objects)}
    if op == 'decimate':
        for o in meshes():
            m = o.modifiers.new('dec', 'DECIMATE'); m.ratio = float(a.get('ratio', 0.5))
            bpy.context.view_layer.objects.active = o; bpy.ops.object.modifier_apply(modifier=m.name)
    elif op != 'convert':
        return {'error': f'unknown op {op}'}
    bpy.ops.export_scene.gltf(filepath=a['out'], export_format='GLB')
    return {'out': a['out'], 'tris_before': before, 'tris_after': tris()}

args = json.loads(sys.argv[sys.argv.index('--') + 1]) if '--' in sys.argv else {}
try: res = main(args)
except Exception as e: res = {'error': str(e)}
print('HUB_RESULT ' + json.dumps(res))
