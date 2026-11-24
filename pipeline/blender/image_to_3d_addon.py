# Image to 3D (Meshy) - a Blender add-on.
# Pick a picture, press the button, and a textured 3D model made from it is brought into the scene.
# The model is made by Meshy's online service (meshy.ai), so it needs a Meshy API key and uses Meshy credits for each model.
#
# Install: Blender > Edit > Preferences > Add-ons > Install from Disk (the arrow at the top right in Blender 4.2+, or the
# "Install..." button in older ones) > pick this file > tick it on. Open its entry there and paste your Meshy API key
# (meshy.ai > API). Then in the 3D view press N and open the "Image to 3D" tab.
#
# Made for Blender 3.6 and newer. Written without a copy of Blender to try it in: the part that talks to Meshy was checked
# on its own, the Blender panel was not.

bl_info = {
    "name": "Image to 3D (Meshy)",
    "author": "Breneland tools",
    "version": (1, 0, 0),
    "blender": (3, 6, 0),
    "location": "3D View > Sidebar (N) > Image to 3D",
    "description": "Make a 3D model from a picture with Meshy and bring it into the scene",
    "category": "Import-Export",
}

import base64
import json
import mimetypes
import os
import tempfile
import threading
import time
import urllib.error
import urllib.request

API = "https://api.meshy.ai/openapi/v1/image-to-3d"


# ---------------------------------------------------------------- talking to Meshy (no Blender needed for this part)

def _call(method, url, key, body=None, timeout=120):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", "Bearer " + key)
    req.add_header("User-Agent", "blender-image-to-3d/1.0")
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        text = e.read().decode("utf-8", "replace")[:400]
        try:
            text = json.loads(text).get("message") or text
        except Exception:
            pass
        if e.code == 401:
            text = "Meshy did not accept the API key."
        elif e.code == 402:
            text = "Not enough Meshy credits."
        raise RuntimeError("Meshy said no (%d): %s" % (e.code, text))
    except urllib.error.URLError as e:
        raise RuntimeError("Could not reach Meshy: %s" % e.reason)


def image_as_data_uri(path):
    kind = mimetypes.guess_type(path)[0] or "image/png"
    if kind not in ("image/png", "image/jpeg"):
        raise RuntimeError("Use a .png or .jpg picture.")
    size = os.path.getsize(path)
    if size > 15 * 1024 * 1024:
        raise RuntimeError("That picture is over 15 MB. Use a smaller one.")
    with open(path, "rb") as f:
        return "data:%s;base64,%s" % (kind, base64.b64encode(f.read()).decode("ascii"))


def start_task(key, image_path, pose="", texture=True, polycount=0):
    body = {"image_url": image_as_data_uri(image_path), "should_texture": bool(texture)}
    if pose:
        body["pose_mode"] = pose          # "a-pose" or "t-pose": for characters that will be rigged
    if polycount:
        body["should_remesh"] = True
        body["target_polycount"] = int(polycount)
    out = _call("POST", API, key, body)
    task = out.get("result") or out.get("id")
    if not task:
        raise RuntimeError("Meshy gave no task number back.")
    return task


def task_state(key, task):
    return _call("GET", API + "/" + task, key, timeout=60)


def download(url, path):
    req = urllib.request.Request(url, headers={"User-Agent": "blender-image-to-3d/1.0"})
    with urllib.request.urlopen(req, timeout=600) as r, open(path, "wb") as f:
        while True:
            chunk = r.read(1 << 16)
            if not chunk:
                break
            f.write(chunk)
    return path


def make_model(key, image_path, pose, texture, polycount, say, stop):
    """Runs start to finish. say(text, percent) reports progress; stop() returning True gives up. Returns the .glb path."""
    say("Sending the picture...", 0)
    task = start_task(key, image_path, pose, texture, polycount)
    began = time.time()
    while True:
        if stop():
            raise RuntimeError("Stopped. (The model may still finish on Meshy's side.)")
        if time.time() - began > 45 * 60:
            raise RuntimeError("Gave up after 45 minutes. Look for the model on meshy.ai.")
        st = task_state(key, task)
        status = st.get("status", "")
        if status == "SUCCEEDED":
            url = (st.get("model_urls") or {}).get("glb") or st.get("model_url")
            if not url:
                raise RuntimeError("Meshy finished but gave no model file.")
            say("Downloading the model...", 100)
            name = os.path.splitext(os.path.basename(image_path))[0] or "model"
            return download(url, os.path.join(tempfile.gettempdir(), "meshy_%s_%s.glb" % (name, task[:8])))
        if status in ("FAILED", "CANCELED", "EXPIRED"):
            err = st.get("task_error") or {}
            raise RuntimeError("Meshy could not make the model: %s" % (err.get("message") or status))
        say("Meshy is making the model...", int(st.get("progress") or 0))
        time.sleep(5)


# ---------------------------------------------------------------- the Blender side

try:
    import bpy
except ImportError:            # lets the part above be used and tested outside Blender
    bpy = None

if bpy:
    JOB = {"thread": None, "text": "", "pct": 0, "glb": "", "error": "", "stop": False, "name": ""}

    class I3D_Prefs(bpy.types.AddonPreferences):
        bl_idname = __name__
        api_key: bpy.props.StringProperty(name="Meshy API key", subtype="PASSWORD",
                                          description="From meshy.ai > API. Kept in Blender's preferences on this computer")

        def draw(self, context):
            self.layout.prop(self, "api_key")
            self.layout.label(text="Each model uses Meshy credits from this key's account.")

    class I3D_Settings(bpy.types.PropertyGroup):
        image: bpy.props.StringProperty(name="Picture", subtype="FILE_PATH", description="A .png or .jpg of the thing to make")
        pose: bpy.props.EnumProperty(name="Pose", description="For characters you will rig, ask for a standard pose",
                                     items=[("", "As drawn", "Keep the pose in the picture"),
                                            ("a-pose", "A-pose", "Arms down at an angle"),
                                            ("t-pose", "T-pose", "Arms straight out")])
        texture: bpy.props.BoolProperty(name="With colours", default=True, description="Make the textures too (costs more credits)")
        polycount: bpy.props.IntProperty(name="Triangles", default=0, min=0, max=300000,
                                         description="Ask for about this many triangles. 0 leaves it to Meshy")

    class I3D_OT_make(bpy.types.Operator):
        bl_idname = "i3d.make"
        bl_label = "Make 3D model"
        bl_description = "Send the picture to Meshy and bring the finished model into the scene"
        _timer = None

        def execute(self, context):
            if JOB["thread"] and JOB["thread"].is_alive():
                self.report({"WARNING"}, "One is already being made.")
                return {"CANCELLED"}
            s = context.scene.i3d
            key = context.preferences.addons[__name__].preferences.api_key.strip()
            path = bpy.path.abspath(s.image)
            if not key:
                self.report({"ERROR"}, "Put your Meshy API key in this add-on's preferences first.")
                return {"CANCELLED"}
            if not path or not os.path.isfile(path):
                self.report({"ERROR"}, "Pick a picture first.")
                return {"CANCELLED"}
            JOB.update(text="Starting...", pct=0, glb="", error="", stop=False, name=os.path.splitext(os.path.basename(path))[0])
            pose, texture, polycount = s.pose, s.texture, s.polycount

            def work():
                try:
                    def say(text, pct):
                        JOB["text"], JOB["pct"] = text, pct
                    JOB["glb"] = make_model(key, path, pose, texture, polycount, say, lambda: JOB["stop"])
                except Exception as e:      # shown in the panel
                    JOB["error"] = str(e)

            JOB["thread"] = threading.Thread(target=work, daemon=True)
            JOB["thread"].start()
            self._timer = context.window_manager.event_timer_add(1.0, window=context.window)
            context.window_manager.modal_handler_add(self)
            return {"RUNNING_MODAL"}

        def modal(self, context, event):
            if event.type != "TIMER":
                return {"PASS_THROUGH"}
            for area in context.screen.areas:
                if area.type == "VIEW_3D":
                    area.tag_redraw()
            if JOB["thread"].is_alive():
                return {"PASS_THROUGH"}
            context.window_manager.event_timer_remove(self._timer)
            if JOB["error"]:
                JOB["text"] = JOB["error"]
                self.report({"ERROR"}, JOB["error"])
                return {"CANCELLED"}
            before = set(bpy.data.objects)
            try:
                bpy.ops.import_scene.gltf(filepath=JOB["glb"])
            except Exception as e:
                JOB["text"] = "The model was made but could not be brought in: %s. It is saved at %s" % (e, JOB["glb"])
                self.report({"ERROR"}, JOB["text"])
                return {"CANCELLED"}
            new = [o for o in bpy.data.objects if o not in before]
            for o in new:
                if o.parent is None:
                    o.name = JOB["name"] or o.name
            JOB["text"] = "Done: %d object(s) added." % len(new)
            self.report({"INFO"}, JOB["text"])
            return {"FINISHED"}

    class I3D_OT_stop(bpy.types.Operator):
        bl_idname = "i3d.stop"
        bl_label = "Stop waiting"
        bl_description = "Stop waiting for the model (credits already spent are not returned)"

        def execute(self, context):
            JOB["stop"] = True
            return {"FINISHED"}

    class I3D_PT_panel(bpy.types.Panel):
        bl_label = "Image to 3D"
        bl_idname = "I3D_PT_panel"
        bl_space_type = "VIEW_3D"
        bl_region_type = "UI"
        bl_category = "Image to 3D"

        def draw(self, context):
            s, col = context.scene.i3d, self.layout.column()
            col.prop(s, "image")
            col.prop(s, "pose")
            col.prop(s, "texture")
            col.prop(s, "polycount")
            busy = bool(JOB["thread"] and JOB["thread"].is_alive())
            row = col.row()
            row.enabled = not busy
            row.operator("i3d.make", icon="MESH_MONKEY")
            if busy:
                col.label(text="%s %d%%" % (JOB["text"], JOB["pct"]))
                col.operator("i3d.stop", icon="CANCEL")
            elif JOB["text"]:
                for i in range(0, len(JOB["text"]), 46):
                    col.label(text=JOB["text"][i:i + 46])
            if not context.preferences.addons[__name__].preferences.api_key.strip():
                col.label(text="Add your Meshy API key in", icon="ERROR")
                col.label(text="Preferences > Add-ons > this add-on.")

    CLASSES = (I3D_Prefs, I3D_Settings, I3D_OT_make, I3D_OT_stop, I3D_PT_panel)

    def register():
        for c in CLASSES:
            bpy.utils.register_class(c)
        bpy.types.Scene.i3d = bpy.props.PointerProperty(type=I3D_Settings)

    def unregister():
        del bpy.types.Scene.i3d
        for c in reversed(CLASSES):
            bpy.utils.unregister_class(c)
